/**
 * `smithy dev` — Local development commands.
 *
 * Subcommands (to be implemented in Phase 7):
 *   start   Start local development environment
 *   logs    Stream worker logs
 *   status  Show local worker status
 */

const DEV_HELP_TEXT = `
smithy dev — Local development commands.

Usage:
  smithy dev <subcommand> [options]

Subcommands:
  start   Start local development environment
  logs    Stream worker logs
  status  Show local worker status

Options:
  --help, -h  Show this help message
`.trim();

export function run(args: string[]): void {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(DEV_HELP_TEXT);
    return;
  }

  const subcommand = args[0];
  console.error(`Error: Unknown dev subcommand '${subcommand}'`);
  console.error(`Run 'smithy dev --help' for available subcommands.`);
  process.exit(1);
}
