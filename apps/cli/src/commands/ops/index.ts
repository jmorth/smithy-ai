/**
 * `smithy ops` — Operational commands.
 *
 * Subcommands (to be implemented in Phase 7):
 *   deploy   Deploy a worker to the platform
 *   scale    Scale worker instances
 *   inspect  Inspect a running worker
 */

const OPS_HELP_TEXT = `
smithy ops — Operational commands.

Usage:
  smithy ops <subcommand> [options]

Subcommands:
  deploy   Deploy a worker to the platform
  scale    Scale worker instances
  inspect  Inspect a running worker

Options:
  --help, -h  Show this help message
`.trim();

export function run(args: string[]): void {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(OPS_HELP_TEXT);
    return;
  }

  const subcommand = args[0];
  console.error(`Error: Unknown ops subcommand '${subcommand}'`);
  console.error(`Run 'smithy ops --help' for available subcommands.`);
  process.exit(1);
}
