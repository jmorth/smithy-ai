import type { Command } from 'commander';
import chalk from 'chalk';
import {
  jobs,
  CliApiError,
  resolveBaseUrl,
} from '../lib/api-client.js';
import type { JobLogEntry } from '../lib/api-client.js';
import {
  isJsonMode,
  setJsonMode,
  spinner,
  error as printError,
} from '../lib/output.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogsOptions {
  follow?: boolean;
  level?: string;
  tail?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_SEVERITY: Record<string, number> = {
  info: 0,
  warn: 1,
  error: 2,
};

const VALID_LEVELS = new Set(Object.keys(LEVEL_SEVERITY));

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function colorLevel(level: string): string {
  switch (level.toLowerCase()) {
    case 'warn':
      return chalk.yellow(level.toUpperCase());
    case 'error':
      return chalk.red(level.toUpperCase());
    default:
      return chalk.white(level.toUpperCase());
  }
}

export function formatLogLine(entry: JobLogEntry): string {
  return `[${formatTimestamp(entry.timestamp)}] [${colorLevel(entry.level)}] ${entry.message}`;
}

export function filterByLevel(
  entries: JobLogEntry[],
  minLevel: string,
): JobLogEntry[] {
  const minSeverity = LEVEL_SEVERITY[minLevel] ?? 0;
  return entries.filter(
    (e) => (LEVEL_SEVERITY[e.level.toLowerCase()] ?? 0) >= minSeverity,
  );
}

export function parseTail(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  if (isNaN(n) || n <= 0) return undefined;
  return n;
}

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

export async function streamSSE(
  jobId: string,
  minLevel: string,
  signal: AbortSignal,
): Promise<void> {
  const baseUrl = await resolveBaseUrl();
  const url = `${baseUrl}/jobs/${encodeURIComponent(jobId)}/logs/stream`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal,
    });
  } catch (err: unknown) {
    if (signal.aborted) return;
    if (err instanceof Error) {
      printError(`SSE connection failed: ${err.message}`);
    }
    return;
  }

  if (!response.ok) {
    printError(`SSE connection failed: HTTP ${response.status}`);
    return;
  }

  if (!response.body) {
    printError('SSE connection returned no body');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (!data) continue;
          try {
            const entry = JSON.parse(data) as JobLogEntry;
            const minSeverity = LEVEL_SEVERITY[minLevel] ?? 0;
            const entrySeverity =
              LEVEL_SEVERITY[entry.level.toLowerCase()] ?? 0;
            if (entrySeverity >= minSeverity) {
              if (isJsonMode()) {
                process.stdout.write(JSON.stringify(entry) + '\n');
              } else {
                process.stdout.write(formatLogLine(entry) + '\n');
              }
            }
          } catch {
            // Skip malformed SSE data
          }
        }
      }
    }
  } catch (err: unknown) {
    if (signal.aborted) return;
    if (err instanceof Error) {
      printError(`SSE stream error: ${err.message}`);
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Core fetch & display
// ---------------------------------------------------------------------------

export async function fetchAndDisplayLogs(
  jobId: string,
  opts: LogsOptions,
): Promise<boolean> {
  const level = opts.level ?? 'info';
  if (!VALID_LEVELS.has(level)) {
    printError(
      `Invalid log level: ${level}. Valid levels: info, warn, error`,
    );
    process.exitCode = 1;
    return false;
  }

  const tail = parseTail(opts.tail);

  const sp = spinner('Fetching logs…');
  sp.start();

  let allEntries: JobLogEntry[] = [];

  try {
    // Fetch all logs (paginated). We request a large page to minimise calls.
    let page = 1;
    const limit = 100;
    let total = Infinity;

    while (allEntries.length < total) {
      const result = await jobs.getLogs(jobId, { page, limit });
      total = result.total;
      allEntries = allEntries.concat(result.data);
      page++;
      if (result.data.length < limit) break;
    }
  } catch (err: unknown) {
    sp.fail('Failed to fetch logs');
    if (err instanceof CliApiError) {
      if (err.status === 404) {
        printError(`Job not found: ${jobId}`);
      } else {
        printError(`API error (${err.status}): ${err.message}`);
        if (err.details) {
          for (const [field, messages] of Object.entries(err.details)) {
            for (const msg of messages) {
              printError(`  ${field}: ${msg}`);
            }
          }
        }
      }
    } else if (err instanceof Error) {
      printError(`Unexpected error: ${err.message}`);
    }
    process.exitCode = 1;
    return false;
  }

  sp.succeed('Logs fetched');

  // Apply level filtering
  let filtered = filterByLevel(allEntries, level);

  // Apply tail
  if (tail !== undefined && tail < filtered.length) {
    filtered = filtered.slice(filtered.length - tail);
  }

  // Output
  if (isJsonMode()) {
    // NDJSON output (one JSON object per line)
    for (const entry of filtered) {
      process.stdout.write(JSON.stringify(entry) + '\n');
    }
  } else {
    // Normal mode
    if (filtered.length === 0) {
      process.stdout.write('No log entries found.\n');
    } else {
      for (const entry of filtered) {
        process.stdout.write(formatLogLine(entry) + '\n');
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

export async function run(
  globalOpts: Record<string, unknown>,
  cmd: Command,
  jobId?: string,
): Promise<void> {
  if (globalOpts.json) setJsonMode(true);
  const opts = cmd.opts<LogsOptions>();

  if (!jobId) {
    printError('Job ID is required. Usage: smithy logs <job-id>');
    process.exitCode = 1;
    return;
  }

  const success = await fetchAndDisplayLogs(jobId, opts);
  if (!success) return;

  if (opts.follow) {
    const ac = new AbortController();
    const sigintHandler = () => {
      ac.abort();
    };
    process.on('SIGINT', sigintHandler);

    try {
      await streamSSE(jobId, opts.level ?? 'info', ac.signal);
    } finally {
      process.removeListener('SIGINT', sigintHandler);
    }
  }
}
