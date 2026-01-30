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

type WorkerSuccess = {
  id: number;
  files: string[];
};

type WorkerError = {
  workerId: number;
  reason: string;
};

async function worker(
  id: number,
  sleep: number,
): Promise<Result<WorkerSuccess, WorkerError>> {
  console.log(`Worker ${id} starting, will sleep for ${sleep}ms`);
  await new Promise((resolve) => setTimeout(resolve, sleep));

  if (sleep < 200) {
    return err({
      workerId: id,
      reason: "timeout too short",
    });
  }

  const output = await $`ls`.text();
  const files = output.trim().split("\n");
  console.log(`Worker ${id} finished`);
  return ok({ id, files });
}

async function runWaitAll(length: number): Promise<void> {
  const results = await Promise.all(
    Array.from({ length }, (_, i) => worker(i, Math.random() * 1000)),
  );

  results.forEach((result) => {
    result.match(
      (success) =>
        console.log(`Worker ${success.id} found ${success.files.length} files`),
      (error) =>
        console.error(`Worker ${error.workerId} failed: ${error.reason}`),
    );
  });
}

async function main(): Promise<void> {
  const workerCount = 10;
  await runWaitAll(workerCount);
}

if (import.meta.main) {
  main();
}
