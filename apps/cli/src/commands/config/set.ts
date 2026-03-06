import type { Command } from 'commander';
import * as config from '../../lib/config.js';
import {
  setJsonMode,
  isJsonMode,
  printJson,
  error,
} from '../../lib/output.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateApiUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function run(
  globalOpts: Record<string, unknown>,
  _cmd: Command,
  key?: string,
  value?: string,
): Promise<void> {
  if (globalOpts.json) setJsonMode(true);

  if (!key) {
    error('Key is required. Usage: smithy config set <key> <value>');
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

  if (value === undefined) {
    error('Value is required. Usage: smithy config set <key> <value>');
    process.exitCode = 1;
    return;
  }

  // Key-specific validation
  if (key === 'apiUrl' && !validateApiUrl(value)) {
    error(
      `Invalid apiUrl: "${value}". Must start with http:// or https://`,
    );
    process.exitCode = 1;
    return;
  }

  await config.set(key, value);

  if (isJsonMode()) {
    printJson({ key, value });
    return;
  }

  process.stdout.write(`Set ${key} = ${value}\n`);
}
