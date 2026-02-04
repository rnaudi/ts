#!/usr/bin/env -S deno run --allow-all
import $ from "@david/dax";
import { err, ok, type Result } from "neverthrow";

/**
 * TODO: We want to practice structured concurrency with modern Typescript.
 * 1. Wait all pattern - Run multiple workers, wait for all to complete, collect all results.
 * 2. Fail-fast pattern - Run multiple workers, cancel all if any fails.
 * 3. Concurrency limiting pattern - Limit concurrent workers to N at a time.
 * 4. Worker pool pattern - Fixed number of workers pull tasks from a queue.
 * 5. Timeout pattern - Cancel workers after X seconds if they take too long.
 * 6. Retry pattern - Retry failed workers N times with exponential backoff.
 * 7. Pipeline pattern - Worker output becomes input to next worker (data flow).
 */

/**
 * Notes and references:
 *
 * I've chosen the `neverthrow` library for Result types. It's nicer than some alternatives like `Effect`.
 * - https://effect.website/docs/additional-resources/effect-vs-neverthrow/
 * What I dislike about `Effect` is that imposes a functional programming style that has more cons than pros.
 * Memory overhead, wrapping functions in layers, more concepts and abstractions to learn, inversion of data flow etc.
 * The downside of `neverthrow` is similar to other libraries in other ecosystems:
 * TypeScript libraries expect throws as control flow.
 *
 * Promises.
 * Promises in JavaScript start immediately when created. This differs from other languages and ecosystems where async tasks
 * must be explicitly started / polled. Depending on the model. I won't go deeper into this here. To sum it up:
 * I personally prefer to explicitly create and start async tasks. I like structured concurrency where I can choose.
 * And for me, that means a split between task creation and task starting. Even if it means wrapping Promises in functions.
 * That's implementation detail, and a cost I'm willing to pay.
 *
 * Exercise.
 * The goal is both simple and easy to understand, I like this exercise because of that.
 * We have jobs and workers. Each worker processes a job. A job will sleep for a random time. A job can return an error.
 * From here we can play on all possible problems in parallelism and concurrency.
 * Infinite Jobs, Jobs grow faster than workers can process, Workers fail, Workers time out, Pools, RAM limits, Preemptive tasks etc.
 * Wow, so much fun.
 *
 * Javascript and Promises.
 * More in detail, we have a couple of design constraints and considerations:
 * - Promises start immediately when created.
 * - Promises cannot be "easily" cancelled.
 * - Errors are thrown, not returned as values.
 * - Try/Catch semantics.
 * - Promise.All vs Promise.AllSettled.
 * - AbortSignal and AbortController.
 * With these constraints in mind, we can start designing our structured concurrency patterns.
 */

type Job = {
  readonly id: number;
  readonly execute: () => Promise<Result<JobSuccess, JobError>>;
};

type JobSuccess = void;

type JobError = string;

type WorkerSuccess = {
  readonly id: number;
  readonly jobId: number;
  readonly files: readonly string[];
};

async function worker(id: number, job: Job): Promise<WorkerSuccess> {
  const jobId = job.id;

  console.log(`Worker ${id} starting ${jobId}`);
  const result = await job.execute();
  if (result.isErr()) {
    throw new Error(`Job ${jobId} failed in Worker ${id}: ${result.error}`);
  }

  const output = await $`ls`.text();
  const files = output.trim().split("\n");
  console.log(`Worker ${id} finished ${jobId}`);
  return { id, jobId, files };
}

function buildWorkers(
  length: number,
): Array<(job: Job) => Promise<WorkerSuccess>> {
  return Array.from({ length }, (_, i) => {
    return (job: Job) => worker(i, job);
  });
}

function buildJobs(length: number): Array<Job> {
  return Array.from({ length }, (_, i) => ({
    id: i,
    execute: async () => {
      const sleep = Math.random() * 1000;
      if (sleep < 200) {
        return err(`sleeping ${sleep.toFixed(2)}ms < 200ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, sleep));
      return ok(void 0);
    },
  }));
}

function buildCancellableJobs(
  signal: AbortSignal,
  length: number,
): Array<Job> {
  return Array.from({ length }, (_, i) => ({
    id: i,
    execute: async () => {
      if (signal.aborted) {
        return err(`Job ${i} cancelled before start`);
      }

      const sleep = Math.random() * 1000;
      if (sleep < 200) {
        return err(`sleeping ${sleep.toFixed(2)}ms < 200ms`);
      }

      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, sleep);
          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new Error(`Job ${i} cancelled during execution`));
          }, { once: true });
        });
        return ok(void 0);
      } catch (e) {
        return err(`Job ${i} aborted: ${(e as Error).message}`);
      }
    },
  }));
}

async function runWaitAll(): Promise<void> {
  const countJobs = 10;
  const countWorkers = 10;

  const jobs = buildJobs(countJobs);
  const workers = buildWorkers(countWorkers);

  const promises = [];
  for (let i = 0; i < countJobs; i++) {
    promises.push(workers[i](jobs[i]));
  }

  try {
    const results = await Promise.all(promises);
    for (const result of results) {
      console.log(
        `Worker ${result.id} processed Job ${result.jobId} with files:`,
        result.files,
      );
    }
  } catch (e) {
    console.error("One or more workers failed:", e);
    return;
  }
}

async function runFailFast(): Promise<void> {
  const countJobs = 10;
  const countWorkers = 10;

  const controller = new AbortController();
  const jobs = buildCancellableJobs(controller.signal, countJobs);
  const workers = buildWorkers(countWorkers);

  const promises = [];
  for (let i = 0; i < countJobs; i++) {
    promises.push(workers[i](jobs[i]));
  }

  try {
    const results = await Promise.all(promises);
    for (const result of results) {
      console.log(
        `Worker ${result.id} processed Job ${result.jobId} with files:`,
        result.files,
      );
    }
  } catch {
    controller.abort();

    const results = await Promise.allSettled(promises);
    const failures = results.filter((r) => r.status === "rejected");

    console.error(`\n${failures.length} job(s) failed or cancelled:`);
    for (const [idx, failure] of failures.entries()) {
      console.error(`  ${idx + 1}. ${failure.reason}`);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

async function runTimeout(): Promise<void> {
  const countJobs = 10;
  const countWorkers = 10;
  const timeoutMs = 500;

  const jobs = buildJobs(countJobs);
  const workers = buildWorkers(countWorkers);

  const promises = [];
  for (let i = 0; i < countJobs; i++) {
    promises.push(withTimeout(workers[i](jobs[i]), timeoutMs));
  }

  const results = await Promise.allSettled(promises);

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  console.log(`\n${successes.length} job(s) completed within ${timeoutMs}ms`);
  if (failures.length > 0) {
    console.error(`${failures.length} job(s) timed out or failed:`);
    for (const [idx, failure] of failures.entries()) {
      console.error(`  ${idx + 1}. ${failure.reason}`);
    }
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts: number,
  baseDelayMs: number = 100,
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (i < attempts - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        console.log(`  Retry ${i + 1}/${attempts - 1} after ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Retries a function following matklad's pattern:
 * - Loop while action returns error, with retries as early exit
 * - No spurious sleep after last attempt
 * - Original error preserved and rethrown
 * - Optional isTransientError predicate to decide if retry is worthwhile
 * @see https://matklad.github.io/2025/08/23/retry-loop-retry.html
 */
async function withRetryTransient<T>(
  fn: () => Promise<T>,
  retryCount: number,
  baseDelayMs: number = 100,
  isTransientError: (e: Error) => boolean = () => true,
): Promise<T> {
  let retriesLeft = retryCount;

  while (true) {
    try {
      return await fn();
    } catch (e) {
      const err = e as Error;

      // Not transient? Don't retry, rethrow original
      if (!isTransientError(err)) {
        throw err;
      }

      // Out of retries? Rethrow original error
      if (retriesLeft === 0) {
        throw err;
      }

      retriesLeft -= 1;
      const delay = baseDelayMs * Math.pow(2, retryCount - retriesLeft - 1);
      console.log(`  Retry ${retryCount - retriesLeft}/${retryCount} after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      // No sleep after last attempt - we throw above
    }
  }
}

async function runRetryTransient(): Promise<void> {
  const countJobs = 5;
  const countWorkers = 5;
  const maxRetries = 3;

  const jobs = buildJobs(countJobs);
  const workers = buildWorkers(countWorkers);

  // Example: only retry if error message contains "sleeping" (transient)
  const isTransient = (e: Error) => e.message.includes("sleeping");

  const promises = [];
  for (let i = 0; i < countJobs; i++) {
    promises.push(
      withRetryTransient(() => workers[i](jobs[i]), maxRetries, 100, isTransient)
    );
  }

  const results = await Promise.allSettled(promises);

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  console.log(`\n${successes.length} job(s) succeeded (with transient retries)`);
  if (failures.length > 0) {
    console.error(`${failures.length} job(s) failed after ${maxRetries} attempts:`);
    for (const [idx, failure] of failures.entries()) {
      console.error(`  ${idx + 1}. ${failure.reason}`);
    }
  }
}

async function runRetry(): Promise<void> {
  const countJobs = 5;
  const countWorkers = 5;
  const maxRetries = 3;

  const jobs = buildJobs(countJobs);
  const workers = buildWorkers(countWorkers);

  const promises = [];
  for (let i = 0; i < countJobs; i++) {
    promises.push(
      withRetry(() => workers[i](jobs[i]), maxRetries)
    );
  }

  const results = await Promise.allSettled(promises);

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  console.log(`\n${successes.length} job(s) succeeded (with retries)`);
  if (failures.length > 0) {
    console.error(`${failures.length} job(s) failed after ${maxRetries} attempts:`);
    for (const [idx, failure] of failures.entries()) {
      console.error(`  ${idx + 1}. ${failure.reason}`);
    }
  }
}

async function main(): Promise<void> {
  console.log("=== Running Wait All pattern ===");
  await runWaitAll();
  
  console.log("\n=== Running Fail Fast pattern ===");
  await runFailFast();
  
  console.log("\n=== Running Timeout pattern ===");
  await runTimeout();
  
  console.log("\n=== Running Retry pattern ===");
  await runRetry();
  
  console.log("\n=== Running Retry Transient pattern (matklad) ===");
  await runRetryTransient();
}

if (import.meta.main) {
  main();
}
