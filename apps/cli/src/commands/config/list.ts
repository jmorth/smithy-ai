import type { Command } from 'commander';
import * as config from '../../lib/config.js';
import {
  setJsonMode,
  isJsonMode,
  printJson,
  printTable,
  error,
} from '../../lib/output.js';

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function run(
  globalOpts: Record<string, unknown>,
  _cmd: Command,
): Promise<void> {
  if (globalOpts.json) setJsonMode(true);

  try {
    const values = await config.list();
    const configPath = config.getConfigPath();

    if (isJsonMode()) {
      printJson({ path: configPath, ...values });
      return;
    }

    process.stdout.write(`Config file: ${configPath}\n\n`);

    const headers = ['Key', 'Value'];
    const rows = Object.entries(values).map(([key, value]) => [
      key,
      value || '(empty)',
    ]);

    printTable(headers, rows);
  } catch (err) {
    error(`Failed to read config: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
