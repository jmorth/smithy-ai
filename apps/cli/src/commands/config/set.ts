import type { Command } from "commander";

export async function run(
  _globalOpts: Record<string, unknown>,
  _cmd: Command,
  _key?: string,
  _value?: string,
): Promise<void> {
  console.log("Not implemented: config set");
}
