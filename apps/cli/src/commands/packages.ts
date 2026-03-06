import type { Command } from 'commander';
import type { Package } from '@smithy/shared';
import {
  packages,
  CliApiError,
} from '../lib/api-client.js';
import type { ListParams } from '../lib/api-client.js';
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

interface PackagesOptions {
  type?: string;
  status?: string;
  page?: string;
  limit?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function truncateId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;

  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function parseIntOrDefault(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) return fallback;
  return n;
}

function workflowColumn(pkg: Package): string {
  if (pkg.assemblyLineId) {
    return truncateId(pkg.assemblyLineId);
  }
  return '-';
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function run(
  globalOpts: Record<string, unknown>,
  cmd: Command,
): Promise<void> {
  if (globalOpts.json) setJsonMode(true);

  const opts = cmd.opts<PackagesOptions>();
  const page = parseIntOrDefault(opts.page, 1);
  const limit = parseIntOrDefault(opts.limit, 20);

  const params: ListParams = { page, limit };

  // Build filter from options
  const filter: Record<string, string> = {};
  if (opts.type) filter['type'] = opts.type;
  if (opts.status) filter['status'] = opts.status;
  if (Object.keys(filter).length > 0) params.filter = filter;

  const sp = spinner('Fetching packages...');
  sp.start();

  try {
    const result = await packages.list(params);
    sp.succeed('Packages fetched');

    if (isJsonMode()) {
      printJson(result);
      return;
    }

    if (result.data.length === 0) {
      process.stdout.write('No packages found.\n');
      return;
    }

    const headers = ['ID', 'Type', 'Status', 'Workflow', 'Created'];
    const rows = result.data.map((pkg) => [
      truncateId(pkg.id),
      pkg.type,
      statusBadge(pkg.status),
      workflowColumn(pkg),
      relativeTime(pkg.createdAt),
    ]);

    printTable(headers, rows);

    // Show pagination info
    const totalPages = Math.ceil(result.total / result.limit);
    if (totalPages > 1) {
      process.stdout.write(
        `\nPage ${result.page} of ${totalPages} (${result.total} total)\n`,
      );
    }
  } catch (err) {
    sp.fail('Failed to fetch packages');
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
