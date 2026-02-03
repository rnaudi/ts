import { parseArgs } from "@std/cli/parse-args";
import $ from "@david/dax";

type CLI =
  | CLIShell
  | CLIServer;

type Profile = "sa-dev" | "analytics-dev";
type CLIShell = { tag: "shell"; profile: Profile };
type CLIServer = { tag: "server"; profile: Profile };

function CLIParse(args: string[]): CLI {
  const flags = parseArgs(args, {
    string: ["mode", "profile"],
  });

  if (!flags.mode || !flags.profile) {
    throw new Error("Usage: --mode=<shell|server> --profile=<sa|an>");
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

async function runShell(cli: CLIShell) {
  await $`aws-vault exec ${cli.profile} --prompt=osascript`;
}

async function runServer(cli: CLIServer) {
  await $`aws-vault exec ${cli.profile} --prompt=osascript --ec2-server`;
}

async function execute(cli: CLI) {
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

async function main() {
  const cli = CLIParse(Deno.args);
  await execute(cli);
}

if (import.meta.main) {
  main();
}