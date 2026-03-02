#!/usr/bin/env bun

const COMMANDS = ["dev", "ops"] as const;
type Command = (typeof COMMANDS)[number];

const HELP_TEXT = `
Smithy CLI — the developer tool for managing AI workers and workflows.

Usage:
  smithy <command> [subcommand] [options]

Commands:
  dev     Local development commands (start, logs, status)
  ops     Operational commands (deploy, scale, inspect)

Options:
  --help, -h    Show help information
  --version, -v Show version information

Run 'smithy <command> --help' for more information on a specific command.
`.trim();

export function printHelp(): void {
  console.log(HELP_TEXT);
}

export function printVersion(): void {
  console.log("@smithy/cli v0.0.0");
}

export function printUnknownCommand(command: string): void {
  console.error(`Error: Unknown command '${command}'`);
  console.error(`Run 'smithy --help' for a list of available commands.`);
}

export async function runCommand(command: Command, args: string[]): Promise<void> {
  const mod = await import(`./commands/${command}/index.js`);
  mod.run(args);
}

export function run(argv: string[]): void {
  const args = argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }

  if (args[0] === "--version" || args[0] === "-v") {
    printVersion();
    return;
  }

  const command = args[0] as string;

  if (!(COMMANDS as readonly string[]).includes(command)) {
    printUnknownCommand(command);
    process.exit(1);
  }

  runCommand(command as Command, args.slice(1));
}

// Only execute when run directly (not imported in tests)
if (import.meta.main) {
  run(process.argv);
}
