import { parseArgs } from "@std/cli/parse-args";
import $ from "@david/dax";

// Constants
const PROMPT = "osascript" as const;

const HELP = `
my-aws - aws-vault wrapper

Usage:
  my-aws --mode=<shell|server> --profile=<sa|an>
  my-aws --help

Modes:
  shell    Open a subshell with AWS credentials
  server   Start an EC2 metadata credentials server

Profiles:
  sa       sa-dev
  an       analytics-dev

Examples:
  my-aws --profile=sa --mode=shell
  my-aws --profile=an --mode=server
`.trim();

// Types
type CLI =
  | CLIShell
  | CLIServer;

type Profile = "sa-dev" | "analytics-dev";
type CLIShell = { readonly tag: "shell"; readonly profile: Profile };
type CLIServer = { readonly tag: "server"; readonly profile: Profile };

/** Prints a message to stderr and exits with code 1 */
function die(message: string): never {
  console.error(message);
  Deno.exit(1);
}

/** Parses CLI arguments into a typed command */
function CLIParse(args: string[]): CLI {
  const flags = parseArgs(args, {
    string: ["mode", "profile"],
    boolean: ["help"],
  });

  if (flags.help || args.length === 0) {
    console.log(HELP);
    Deno.exit(0);
  }

  if (!flags.mode && !flags.profile) {
    die(`error: missing --mode and --profile\n\n${HELP}`);
  }

  if (!flags.mode) {
    die(`error: missing --mode (shell or server)\n\nRun my-aws --help for usage.`);
  }

  if (!flags.profile) {
    die(`error: missing --profile (sa or an)\n\nRun my-aws --help for usage.`);
  }

  const profile: Profile = (() => {
    switch (flags.profile) {
      case "sa":
        return "sa-dev";
      case "an":
        return "analytics-dev";
      default:
        die(`error: unknown profile "${flags.profile}"\n\nAvailable profiles: sa (sa-dev), an (analytics-dev)`);
    }
  })();

  switch (flags.mode) {
    case "shell":
      return { tag: "shell", profile };
    case "server":
      return { tag: "server", profile };
    default:
      die(`error: unknown mode "${flags.mode}"\n\nAvailable modes: shell, server`);
  }
}

/** Executes aws-vault shell for the given profile */
async function runShell(cli: CLIShell): Promise<void> {
  await $`aws-vault exec ${cli.profile} --prompt=${PROMPT}`;
}

/** Executes aws-vault with EC2 server for the given profile */
async function runServer(cli: CLIServer): Promise<void> {
  await $`aws-vault exec ${cli.profile} --prompt=${PROMPT} --ec2-server`;
}

async function execute(cli: CLI): Promise<void> {
  switch (cli.tag) {
    case "shell":
      return await runShell(cli);
    case "server":
      return await runServer(cli);
    default: {
      const _exhaustive: never = cli;
      throw new Error(`Unreachable value: ${_exhaustive}`);
    }
  }
}

async function main(): Promise<void> {
  const cli = CLIParse(Deno.args);
  try {
    await execute(cli);
  } catch (e) {
    // dax subprocess errors: aws-vault already printed its own error to stderr,
    // just forward the exit code
    const err = e as Error;
    const match = err.message?.match(/Exited with code: (\d+)/);
    if (match) {
      Deno.exit(Number(match[1]));
    }
    // Unexpected error: print and exit
    console.error(`error: ${err.message}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
