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
 * The downside of `nverthrow` is similar to other libraries in other ecosystems:
 * Typescript libraries except throws as control flow.
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
  id: number;
  execute: () => Promise<Result<JobSuccess, JobError>>;
};

type JobSuccess = void;

type JobError = string;

type WorkerSuccess = {
  id: number;
  jobId: number;
  files: string[];
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
          });
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
  for (let i = 0; i < 10; i++) {
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
  for (let i = 0; i < 10; i++) {
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
    const failures = results.filter(r => r.status === "rejected");
    
    console.error(`\n${failures.length} job(s) failed or cancelled:`);
    for (const [idx, failure] of failures.entries()) {
      console.error(`  ${idx + 1}. ${failure.reason}`);
    }
  }
}

async function main(): Promise<void> {
  console.log("Running Wait All pattern:");
  await runWaitAll();
  console.log("Running Fail Fast pattern:");
  await runFailFast();
}

if (import.meta.main) {
  main();
}