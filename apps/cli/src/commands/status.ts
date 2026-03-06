import type { Command } from 'commander';
import type { AssemblyLine, WorkerPool } from '@smithy/shared';
import {
  assemblyLines,
  workerPools,
  CliApiError,
} from '../lib/api-client.js';
import {
  setJsonMode,
  isJsonMode,
  printJson,
  printTable,
  statusBadge,
  spinner,
  error,
} from '../lib/output.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusOptions {
  line?: string;
  pool?: string;
  watch?: boolean;
  interval?: string;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export function renderSummary(
  lines: AssemblyLine[],
  pools: WorkerPool[],
): void {
  if (isJsonMode()) {
    printJson({ assemblyLines: lines, workerPools: pools });
    return;
  }

  const headers = ['Name', 'Type', 'Status', 'Slug'];
  const rows: string[][] = [];

  for (const line of lines) {
    rows.push([line.name, 'line', statusBadge(line.status), line.slug]);
  }
  for (const pool of pools) {
    rows.push([pool.name, 'pool', statusBadge(pool.status), pool.slug]);
  }

  if (rows.length === 0) {
    process.stdout.write('No assembly lines or worker pools found.\n');
    return;
  }

  printTable(headers, rows);
}

export function renderLineDetail(line: AssemblyLine): void {
  if (isJsonMode()) {
    printJson(line);
    return;
  }

  process.stdout.write(`Assembly Line: ${line.name}\n`);
  process.stdout.write(`Slug: ${line.slug}\n`);
  process.stdout.write(`Status: ${statusBadge(line.status)}\n`);
  if (line.description) {
    process.stdout.write(`Description: ${line.description}\n`);
  }
  process.stdout.write(`Created: ${line.createdAt}\n`);
  process.stdout.write(`Updated: ${line.updatedAt}\n`);
}

export function renderPoolDetail(pool: WorkerPool): void {
  if (isJsonMode()) {
    printJson(pool);
    return;
  }

  process.stdout.write(`Worker Pool: ${pool.name}\n`);
  process.stdout.write(`Slug: ${pool.slug}\n`);
  process.stdout.write(`Status: ${statusBadge(pool.status)}\n`);
  if (pool.description) {
    process.stdout.write(`Description: ${pool.description}\n`);
  }
  process.stdout.write(`Max Concurrency: ${pool.maxConcurrency}\n`);
  process.stdout.write(`Created: ${pool.createdAt}\n`);
  process.stdout.write(`Updated: ${pool.updatedAt}\n`);
}

// ---------------------------------------------------------------------------
// Core fetch + render logic
// ---------------------------------------------------------------------------

export async function fetchAndRender(opts: StatusOptions): Promise<boolean> {
  if (opts.line && opts.pool) {
    error('Cannot specify both --line and --pool. Choose one.');
    process.exitCode = 1;
    return false;
  }

  try {
    if (opts.line) {
      const spin = spinner('Fetching assembly line status...');
      spin.start();
      const line = await assemblyLines.get(opts.line);
      spin.succeed('Fetched assembly line status');
      renderLineDetail(line);
    } else if (opts.pool) {
      const spin = spinner('Fetching worker pool status...');
      spin.start();
      const pool = await workerPools.get(opts.pool);
      spin.succeed('Fetched worker pool status');
      renderPoolDetail(pool);
    } else {
      const spin = spinner('Fetching platform status...');
      spin.start();
      const [lineResult, poolResult] = await Promise.all([
        assemblyLines.list(),
        workerPools.list(),
      ]);
      spin.succeed('Fetched platform status');
      renderSummary(lineResult.data, poolResult.data);
    }
    return true;
  } catch (err) {
    if (err instanceof CliApiError) {
      if (err.status === 404) {
        if (opts.line) {
          error(`Assembly line not found: ${opts.line}`);
        } else if (opts.pool) {
          error(`Worker pool not found: ${opts.pool}`);
        } else {
          error(`Not found: ${err.message}`);
        }
      } else {
        error(`API error (${err.status}): ${err.message}`);
        if (err.details) {
          for (const [field, messages] of Object.entries(err.details)) {
            for (const msg of messages) {
              error(`  ${field}: ${msg}`);
            }
          }
        }
      }
    } else {
      error(`Unexpected error: ${(err as Error).message}`);
    }
    process.exitCode = 1;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Watch mode
// ---------------------------------------------------------------------------

export function parseInterval(value: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) {
    return 5;
  }
  return parsed;
}

export async function watchLoop(
  opts: StatusOptions,
  intervalSeconds: number,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    // Clear screen on each refresh (except in JSON mode)
    if (!isJsonMode()) {
      process.stdout.write('\x1B[2J\x1B[H');
    }

    await fetchAndRender(opts);

    // Wait for the interval, checking for abort
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, intervalSeconds * 1000);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function run(
  globalOpts: Record<string, unknown>,
  cmd: Command,
): Promise<void> {
  if (globalOpts.json) setJsonMode(true);

  const opts = cmd.opts<StatusOptions>();

  if (opts.line && opts.pool) {
    error('Cannot specify both --line and --pool. Choose one.');
    process.exitCode = 1;
    return;
  }

  if (opts.watch) {
    const intervalSeconds = parseInterval(opts.interval ?? '5');
    const ac = new AbortController();

    const onSignal = () => ac.abort();
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    try {
      await watchLoop(opts, intervalSeconds, ac.signal);
    } finally {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    }
  } else {
    await fetchAndRender(opts);
  }
}
