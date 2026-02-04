import { parseArgs } from "@std/cli/parse-args";
import $ from "@david/dax";

// Constants
const PROMPT = "osascript" as const;
const USAGE = "Usage: --mode=<shell|server> --profile=<sa|an>" as const;

// Types
type CLI =
  | CLIShell
  | CLIServer;

type Profile = "sa-dev" | "analytics-dev";
type CLIShell = { readonly tag: "shell"; readonly profile: Profile };
type CLIServer = { readonly tag: "server"; readonly profile: Profile };

/** Parses CLI arguments into a typed command */
function CLIParse(args: string[]): CLI {
  const flags = parseArgs(args, {
    string: ["mode", "profile"],
  });

  if (!flags.mode || !flags.profile) {
    throw new Error(USAGE);
  }

  const profile: Profile = (() => {
    switch (flags.profile) {
      case "sa":
        return "sa-dev";
      case "an":
        return "analytics-dev";
      default:
        throw new Error(`Unknown profile: ${flags.profile}, use "sa" or "an".`);
    }
  })();

  switch (flags.mode) {
    case "shell":
      return { tag: "shell", profile };
    case "server":
      return { tag: "server", profile };
    default:
      throw new Error(`Unknown mode: ${flags.mode}, use "shell" or "server".`);
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
  await execute(cli);
}

if (import.meta.main) {
  main();
}
