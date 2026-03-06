import type { Command } from 'commander';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { input } from '@inquirer/prompts';
import {
  packages,
  assemblyLines,
  workerPools,
  uploadToPresignedUrl,
  CliApiError,
} from '../lib/api-client.js';
import * as config from '../lib/config.js';
import {
  setJsonMode,
  isJsonMode,
  printJson,
  spinner,
  error,
} from '../lib/output.js';
import type { Package } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubmitOptions {
  line?: string;
  pool?: string;
  file?: string[];
  metadata?: string[];
  dryRun?: boolean;
}

interface ParsedMetadata {
  [key: string]: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseMetadataFlags(flags: string[]): ParsedMetadata {
  const result: ParsedMetadata = {};
  for (const flag of flags) {
    const eqIndex = flag.indexOf('=');
    if (eqIndex < 1) {
      throw new Error(
        `Invalid metadata format: "${flag}". Expected key=value.`,
      );
    }
    const key = flag.slice(0, eqIndex);
    const value = flag.slice(eqIndex + 1);
    result[key] = value;
  }
  return result;
}

export async function promptForMetadata(): Promise<ParsedMetadata> {
  const result: ParsedMetadata = {};

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const key = await input({
      message: 'Metadata key (blank to finish):',
    });

    if (!key.trim()) break;

    const value = await input({
      message: `Value for "${key}":`,
    });

    result[key.trim()] = value;
  }

  return result;
}

export function validateFiles(paths: string[]): string[] {
  const resolved: string[] = [];
  for (const p of paths) {
    const abs = resolve(p);
    if (!existsSync(abs)) {
      throw new Error(`File not found: ${p}`);
    }
    resolved.push(abs);
  }
  return resolved;
}

async function uploadFile(
  packageId: string,
  filePath: string,
): Promise<void> {
  const file = Bun.file(filePath);
  const filename = filePath.split('/').pop()!;
  const contentType = file.type || 'application/octet-stream';

  const spin = spinner(`Uploading ${filename}...`);
  spin.start();

  try {
    // Step 1: Get presigned URL
    const { uploadUrl, fileKey } = await packages.presign(packageId, {
      filename,
      contentType,
    });

    // Step 2: Upload to presigned URL
    const contents = new Uint8Array(await file.arrayBuffer());
    await uploadToPresignedUrl(uploadUrl, contents, contentType);

    // Step 3: Confirm upload
    await packages.confirmFile(packageId, {
      fileKey,
      filename,
      mimeType: contentType,
      sizeBytes: file.size,
    });

    spin.succeed(`Uploaded ${filename}`);
  } catch (err) {
    spin.fail(`Failed to upload ${filename}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function run(
  globalOpts: Record<string, unknown>,
  cmd: Command,
  type?: string,
): Promise<void> {
  if (globalOpts.json) setJsonMode(true);

  const opts = cmd.opts<SubmitOptions>();

  // Validate type argument
  if (!type) {
    error('Package type is required. Usage: smithy submit <type>');
    process.exitCode = 1;
    return;
  }

  // Resolve target: --line, --pool, or defaultAssemblyLine from config
  let targetType: 'line' | 'pool';
  let targetSlug: string;

  if (opts.line && opts.pool) {
    error('Cannot specify both --line and --pool. Choose one.');
    process.exitCode = 1;
    return;
  }

  if (opts.line) {
    targetType = 'line';
    targetSlug = opts.line;
  } else if (opts.pool) {
    targetType = 'pool';
    targetSlug = opts.pool;
  } else {
    // Check config for default assembly line
    const defaultLine = await config.get('defaultAssemblyLine');
    if (defaultLine) {
      targetType = 'line';
      targetSlug = defaultLine;
    } else {
      error(
        'Must specify --line <slug> or --pool <slug> (or set defaultAssemblyLine in config).',
      );
      process.exitCode = 1;
      return;
    }
  }

  // Parse metadata
  let metadata: ParsedMetadata = {};
  if (opts.metadata && opts.metadata.length > 0) {
    try {
      metadata = parseMetadataFlags(opts.metadata);
    } catch (err) {
      error((err as Error).message);
      process.exitCode = 1;
      return;
    }
  } else if (!isJsonMode() && process.stdin.isTTY) {
    // Interactive mode: prompt for metadata
    metadata = await promptForMetadata();
  }

  // Validate files exist before any API calls
  let resolvedFiles: string[] = [];
  if (opts.file && opts.file.length > 0) {
    try {
      resolvedFiles = validateFiles(opts.file);
    } catch (err) {
      error((err as Error).message);
      process.exitCode = 1;
      return;
    }
  }

  // Dry run: show what would be submitted
  if (opts.dryRun) {
    const summary = {
      type,
      target: `${targetType}:${targetSlug}`,
      metadata,
      files: resolvedFiles.map((f) => f.split('/').pop()),
    };
    if (isJsonMode()) {
      printJson(summary);
    } else {
      process.stdout.write(`Dry run — would submit:\n`);
      process.stdout.write(`  Type:   ${type}\n`);
      process.stdout.write(
        `  Target: ${targetType === 'line' ? 'Assembly Line' : 'Worker Pool'} "${targetSlug}"\n`,
      );
      if (Object.keys(metadata).length > 0) {
        process.stdout.write(`  Metadata:\n`);
        for (const [k, v] of Object.entries(metadata)) {
          process.stdout.write(`    ${k}=${v}\n`);
        }
      }
      if (resolvedFiles.length > 0) {
        process.stdout.write(`  Files:\n`);
        for (const f of resolvedFiles) {
          process.stdout.write(`    ${f.split('/').pop()}\n`);
        }
      }
    }
    return;
  }

  // Submit
  try {
    const spin = spinner('Submitting package...');
    spin.start();

    let pkg: Package;
    if (targetType === 'line') {
      pkg = await assemblyLines.submit(targetSlug, { type, metadata });
    } else {
      pkg = await workerPools.submit(targetSlug, { type, metadata });
    }

    spin.succeed('Package submitted');

    // Upload files
    for (const filePath of resolvedFiles) {
      await uploadFile(pkg.id, filePath);
    }

    // Output
    if (isJsonMode()) {
      printJson(pkg);
    } else {
      const target =
        targetType === 'line' ? 'Assembly Line' : 'Worker Pool';
      process.stdout.write(`\nPackage created successfully.\n`);
      process.stdout.write(`  ID:     ${pkg.id}\n`);
      process.stdout.write(`  Type:   ${pkg.type}\n`);
      process.stdout.write(`  Target: ${target} "${targetSlug}"\n`);
      process.stdout.write(`  Status: ${pkg.status}\n`);
    }
  } catch (err) {
    if (err instanceof CliApiError) {
      error(`API error (${err.status}): ${err.message}`);
      if (err.details) {
        for (const [field, messages] of Object.entries(err.details)) {
          for (const msg of messages) {
            error(`  ${field}: ${msg}`);
          }
        }
      }
    } else {
      error(`Unexpected error: ${(err as Error).message}`);
    }
    process.exitCode = 1;
  }
}
