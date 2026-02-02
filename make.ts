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
 */

type Job = {
  id: number;
  sleep: number;
};

type WorkerSuccess = {
  id: number;
  jobId: number;
  files: string[];
};

type WorkerError = {
  workerId: number;
  jobId: number;
  reason: string;
};

async function worker(id: number, job: Job): Promise<Result<WorkerSuccess, WorkerError>> {
  const jobId = job.id;
  const sleep = job.sleep;

  console.log(`Worker ${id} starting ${jobId}, will sleep for ${sleep}ms`);
  await new Promise((resolve) => setTimeout(resolve, sleep));

  if (sleep < 200) {
    return err({
      workerId: id,
      jobId,
      reason: "timeout too short",
    });
  }

  const output = await $`ls`.text();
  const files = output.trim().split("\n");
  console.log(`Worker ${id} finished ${jobId}`);
  return ok({ id, jobId, files });
}

function buildWorkers(length: number): Array<(job: Job) => Promise<Result<WorkerSuccess, WorkerError>>> {
  return Array.from({ length }, (_, i) => {
    return (job: Job) => worker(i, job);
  });
}

function buildJobs(length: number): Array<Job> {
  return Array.from({ length }, (_, i) => ({
    id: i,
    sleep: Math.random() * 1000,
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

  const results = await Promise.all(promises);

  results.forEach((result) => {
    result.match(
      (success) =>
        console.log(`Worker ${success.id} with job ${success.jobId} found ${success.files.length} files`),
      (error) =>
        console.error(`Worker ${error.workerId} with job ${error.jobId} failed: ${error.reason}`),
    );
  });
}

async function main(): Promise<void> {
  await runWaitAll();
}

if (import.meta.main) {
  main();
}
