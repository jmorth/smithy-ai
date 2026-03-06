import chalk from 'chalk';
import ora from 'ora';

// ---------------------------------------------------------------------------
// JSON mode
// ---------------------------------------------------------------------------

let jsonMode = false;

export function isJsonMode(): boolean {
  return jsonMode;
}

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function printJson(data: unknown): void {
  process.stdout.write(formatJson(data) + '\n');
}

// ---------------------------------------------------------------------------
// Table printer
// ---------------------------------------------------------------------------

export function printTable(headers: string[], rows: string[][]): void {
  if (jsonMode) {
    const objects = rows.map((row) => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]!] = row[i] ?? '';
      }
      return obj;
    });
    process.stdout.write(formatJson(objects) + '\n');
    return;
  }

  const minPadding = 2;
  const colWidths = headers.map((h) => h.length);

  for (const row of rows) {
    for (let i = 0; i < headers.length; i++) {
      const cellLen = (row[i] ?? '').length;
      if (cellLen > colWidths[i]!) {
        colWidths[i] = cellLen;
      }
    }
  }

  const formatRow = (cells: string[]): string =>
    cells
      .map((cell, i) =>
        i < cells.length - 1
          ? cell.padEnd(colWidths[i]! + minPadding)
          : cell,
      )
      .join('');

  const separator = colWidths
    .map((w, i) =>
      i < colWidths.length - 1
        ? '-'.repeat(w + minPadding)
        : '-'.repeat(w),
    )
    .join('');

  const lines: string[] = [];
  lines.push(formatRow(headers));
  lines.push(separator);
  for (const row of rows) {
    const padded = headers.map((_, i) => row[i] ?? '');
    lines.push(formatRow(padded));
  }

  process.stdout.write(lines.join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const greenStatuses = new Set(['active', 'completed', 'healthy']);
const yellowStatuses = new Set(['pending', 'stuck', 'processing']);
const redStatuses = new Set(['error', 'failed', 'dead']);

export function statusBadge(status: string): string {
  const normalized = status.toLowerCase();
  if (greenStatuses.has(normalized)) return chalk.green(normalized);
  if (yellowStatuses.has(normalized)) return chalk.yellow(normalized);
  if (redStatuses.has(normalized)) return chalk.red(normalized);
  return normalized;
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

interface SpinnerLike {
  start(): SpinnerLike;
  stop(): SpinnerLike;
  succeed(text?: string): SpinnerLike;
  fail(text?: string): SpinnerLike;
}

function createNoopSpinner(): SpinnerLike {
  const noop: SpinnerLike = {
    start() { return noop; },
    stop() { return noop; },
    succeed() { return noop; },
    fail() { return noop; },
  };
  return noop;
}

export function spinner(text: string): SpinnerLike {
  if (jsonMode) return createNoopSpinner();
  return ora(text) as unknown as SpinnerLike;
}

// ---------------------------------------------------------------------------
// Error output
// ---------------------------------------------------------------------------

export function error(message: string): void {
  process.stderr.write(chalk.red(message) + '\n');
}
