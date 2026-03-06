import type { Command } from 'commander';
import * as config from '../../lib/config.js';
import {
  setJsonMode,
  isJsonMode,
  printJson,
  error,
} from '../../lib/output.js';

// ---------------------------------------------------------------------------
// Defaults (mirror from config module for "is default" detection)
// ---------------------------------------------------------------------------

const DEFAULTS: Record<string, string> = {
  apiUrl: 'http://localhost:3000/api',
  defaultPackageType: '',
  defaultAssemblyLine: '',
};

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function run(
  globalOpts: Record<string, unknown>,
  _cmd: Command,
  key?: string,
): Promise<void> {
  if (globalOpts.json) setJsonMode(true);

  if (!key) {
    error('Key is required. Usage: smithy config get <key>');
    process.exitCode = 1;
    return;
  }

  if (!config.isValidKey(key)) {
    error(
      `Unknown config key: "${key}". Valid keys: apiUrl, defaultPackageType, defaultAssemblyLine`,
    );
    process.exitCode = 1;
    return;
  }

  const value = await config.get(key);

  if (isJsonMode()) {
    printJson({ key, value });
    return;
  }

  const isDefault = value === DEFAULTS[key];
  if (isDefault) {
    process.stdout.write(`${value} (default)\n`);
  } else {
    process.stdout.write(`${value}\n`);
  }
}
