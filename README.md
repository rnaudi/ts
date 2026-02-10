# ts

TypeScript playground for async patterns and CLI tools, built on Deno.

## Concurrency patterns (`concurrency.ts`)

Five structured concurrency exercises exploring how JS Promises actually behave and how to work around their quirks (eager execution, no cancellation, throw-based errors).

| Pattern | What it does | Key API |
|---|---|---|
| **Wait All** | Run N workers, collect all results | `Promise.all` |
| **Fail Fast** | Cancel remaining work when one fails | `AbortController` + `Promise.allSettled` |
| **Timeout** | Race each worker against a deadline | `Promise.race` |
| **Retry** | Exponential backoff on failure | `2^attempt` delay loop |
| **Retry Transient** | Only retry transient errors, preserve original | [matklad's pattern](https://matklad.github.io/2025/08/23/retry-loop-retry.html) |

Jobs wrap their work in `() => Promise<T>` so we control when they start. Errors are typed with `neverthrow` (`Result<T, E>`). Cancellable jobs use `AbortSignal` to clean up timers.

```
deno run --allow-all concurrency.ts
```

## aws-vault wrapper (`aws.ts`)

CLI that wraps `aws-vault` with typed commands using discriminated unions and exhaustive pattern matching.

```
deno run --allow-run --allow-env --allow-read aws.ts --profile=sa --mode=server
```

| Flag | Values | Description |
|---|---|---|
| `--mode` | `shell`, `server` | Subshell or EC2 metadata server |
| `--profile` | `sa`, `an` | Aliases for `sa-dev`, `analytics-dev` |

### Install

From [releases](https://github.com/rnaudi/ts/releases) (macOS ARM):

```
mkdir -p ~/bin
curl -L -o ~/bin/my-aws https://github.com/rnaudi/ts/releases/latest/download/my-aws-darwin-arm64
chmod +x ~/bin/my-aws
```

From source:

```
deno compile --allow-run --allow-env --allow-read --output ~/bin/my-aws aws.ts
```

Add `~/bin` to your PATH if you haven't already:

```
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
```

## Dependencies

- [`@david/dax`](https://jsr.io/@david/dax) -- shell scripting
- [`@std/cli`](https://jsr.io/@std/cli) -- argument parsing
- [`neverthrow`](https://github.com/supermacro/neverthrow) -- typed errors
