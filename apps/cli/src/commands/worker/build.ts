import type { Command } from "commander";

export async function run(
  _globalOpts: Record<string, unknown>,
  _cmd: Command,
): Promise<void> {
  console.log("Not implemented: worker build");
}
