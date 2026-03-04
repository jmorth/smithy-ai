import type { Command } from "commander";

export async function run(
  _globalOpts: Record<string, unknown>,
  _cmd: Command,
  _key?: string,
): Promise<void> {
  console.log("Not implemented: config get");
}
