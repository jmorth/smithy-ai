import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
} from 'bun:test';

// We need to control process.argv and stdout.isTTY for testing.
// Import the module fresh for each test group via dynamic import won't work
// well with bun:test, so we use the module-level setter approach instead.

import {
  printTable,
  spinner,
  statusBadge,
  formatJson,
  printJson,
  isJsonMode,
  setJsonMode,
  error,
} from './output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let stdoutWrites: string[];
let stdoutWriteSpy: ReturnType<typeof spyOn>;
let stderrWrites: string[];
let stderrWriteSpy: ReturnType<typeof spyOn>;

function captureStdout(): void {
  stdoutWrites = [];
  stdoutWriteSpy = spyOn(process.stdout, 'write').mockImplementation(
    (chunk: string | Uint8Array) => {
      stdoutWrites.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    },
  );
}

function captureStderr(): void {
  stderrWrites = [];
  stderrWriteSpy = spyOn(process.stderr, 'write').mockImplementation(
    (chunk: string | Uint8Array) => {
      stderrWrites.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    },
  );
}

// ---------------------------------------------------------------------------
// isJsonMode / setJsonMode
// ---------------------------------------------------------------------------

describe('isJsonMode', () => {
  afterEach(() => {
    setJsonMode(false);
  });

  it('returns false by default', () => {
    expect(isJsonMode()).toBe(false);
  });

  it('returns true after setJsonMode(true)', () => {
    setJsonMode(true);
    expect(isJsonMode()).toBe(true);
  });

  it('returns false after setJsonMode(false)', () => {
    setJsonMode(true);
    setJsonMode(false);
    expect(isJsonMode()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatJson
// ---------------------------------------------------------------------------

describe('formatJson', () => {
  it('returns pretty-printed JSON with 2-space indent', () => {
    const data = { name: 'test', count: 42 };
    const result = formatJson(data);
    expect(result).toBe(JSON.stringify(data, null, 2));
  });

  it('handles arrays', () => {
    const data = [1, 2, 3];
    expect(formatJson(data)).toBe(JSON.stringify(data, null, 2));
  });

  it('handles null', () => {
    expect(formatJson(null)).toBe('null');
  });

  it('handles strings', () => {
    expect(formatJson('hello')).toBe('"hello"');
  });

  it('handles nested objects', () => {
    const data = { a: { b: { c: 1 } } };
    expect(formatJson(data)).toBe(JSON.stringify(data, null, 2));
  });
});

// ---------------------------------------------------------------------------
// printJson
// ---------------------------------------------------------------------------

describe('printJson', () => {
  beforeEach(() => {
    captureStdout();
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
  });

  it('writes pretty-printed JSON to stdout', () => {
    const data = { key: 'value' };
    printJson(data);
    const output = stdoutWrites.join('');
    expect(output).toBe(JSON.stringify(data, null, 2) + '\n');
  });

  it('writes array JSON to stdout', () => {
    const data = [{ id: 1 }, { id: 2 }];
    printJson(data);
    const output = stdoutWrites.join('');
    expect(output).toBe(JSON.stringify(data, null, 2) + '\n');
  });
});

// ---------------------------------------------------------------------------
// printTable — normal mode
// ---------------------------------------------------------------------------

describe('printTable', () => {
  beforeEach(() => {
    setJsonMode(false);
    captureStdout();
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    setJsonMode(false);
  });

  it('prints a formatted ASCII table with headers and rows', () => {
    const headers = ['Name', 'Age'];
    const rows = [
      ['Alice', '30'],
      ['Bob', '25'],
    ];
    printTable(headers, rows);
    const output = stdoutWrites.join('');
    // Should contain all data
    expect(output).toContain('Name');
    expect(output).toContain('Age');
    expect(output).toContain('Alice');
    expect(output).toContain('30');
    expect(output).toContain('Bob');
    expect(output).toContain('25');
  });

  it('auto-sizes columns to content width', () => {
    const headers = ['ID', 'Description'];
    const rows = [
      ['1', 'Short'],
      ['200', 'A longer description here'],
    ];
    printTable(headers, rows);
    const output = stdoutWrites.join('');
    const lines = output.trim().split('\n');

    // Header line and rows should exist
    expect(lines.length).toBeGreaterThanOrEqual(3); // header + separator + 2 rows

    // The Description column should be wider than ID column
    // Check that header "Description" and "A longer description here" are aligned
    const headerLine = lines[0]!;
    const lastRowLine = lines[lines.length - 1]!;
    // Both should have the same column positions
    const descHeaderIdx = headerLine.indexOf('Description');
    const descRowIdx = lastRowLine.indexOf('A longer description here');
    expect(descHeaderIdx).toBe(descRowIdx);
  });

  it('has minimum 2-space padding between columns', () => {
    const headers = ['A', 'B'];
    const rows = [['x', 'y']];
    printTable(headers, rows);
    const output = stdoutWrites.join('');
    const lines = output.trim().split('\n');
    const headerLine = lines[0]!;
    // After 'A' there should be at least 2 spaces before 'B'
    const aIdx = headerLine.indexOf('A');
    const bIdx = headerLine.indexOf('B');
    expect(bIdx - aIdx).toBeGreaterThanOrEqual(3); // 'A' + at least 2 spaces
  });

  it('handles empty rows', () => {
    const headers = ['Name', 'Value'];
    const rows: string[][] = [];
    printTable(headers, rows);
    const output = stdoutWrites.join('');
    // Should still print headers
    expect(output).toContain('Name');
    expect(output).toContain('Value');
  });

  it('handles single column', () => {
    const headers = ['Name'];
    const rows = [['Alice'], ['Bob']];
    printTable(headers, rows);
    const output = stdoutWrites.join('');
    expect(output).toContain('Alice');
    expect(output).toContain('Bob');
  });
});

// ---------------------------------------------------------------------------
// printTable — JSON mode
// ---------------------------------------------------------------------------

describe('printTable in JSON mode', () => {
  beforeEach(() => {
    setJsonMode(true);
    captureStdout();
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    setJsonMode(false);
  });

  it('outputs JSON array of objects using headers as keys', () => {
    const headers = ['Name', 'Age'];
    const rows = [
      ['Alice', '30'],
      ['Bob', '25'],
    ];
    printTable(headers, rows);
    const output = stdoutWrites.join('');
    const parsed = JSON.parse(output);
    expect(parsed).toEqual([
      { Name: 'Alice', Age: '30' },
      { Name: 'Bob', Age: '25' },
    ]);
  });

  it('outputs empty array for no rows', () => {
    const headers = ['Name', 'Age'];
    const rows: string[][] = [];
    printTable(headers, rows);
    const output = stdoutWrites.join('');
    const parsed = JSON.parse(output);
    expect(parsed).toEqual([]);
  });

  it('handles rows with fewer values than headers', () => {
    const headers = ['A', 'B', 'C'];
    const rows = [['1', '2']];
    printTable(headers, rows);
    const output = stdoutWrites.join('');
    const parsed = JSON.parse(output);
    expect(parsed).toEqual([{ A: '1', B: '2', C: '' }]);
  });
});

// ---------------------------------------------------------------------------
// statusBadge
// ---------------------------------------------------------------------------

describe('statusBadge', () => {
  it('returns a string for any status', () => {
    expect(typeof statusBadge('active')).toBe('string');
  });

  it('normalizes input to lowercase before matching', () => {
    // Both cases should produce the same result
    const upper = statusBadge('ACTIVE');
    const lower = statusBadge('active');
    expect(upper).toBe(lower);
  });

  it('handles green statuses: active, completed, healthy', () => {
    for (const status of ['active', 'completed', 'healthy']) {
      const badge = statusBadge(status);
      expect(badge).toContain(status);
    }
  });

  it('handles yellow statuses: pending, stuck, processing', () => {
    for (const status of ['pending', 'stuck', 'processing']) {
      const badge = statusBadge(status);
      expect(badge).toContain(status);
    }
  });

  it('handles red statuses: error, failed, dead', () => {
    for (const status of ['error', 'failed', 'dead']) {
      const badge = statusBadge(status);
      expect(badge).toContain(status);
    }
  });

  it('returns default color for unknown statuses', () => {
    const badge = statusBadge('unknown-status');
    expect(badge).toContain('unknown-status');
  });
});

// ---------------------------------------------------------------------------
// spinner — normal mode
// ---------------------------------------------------------------------------

describe('spinner', () => {
  afterEach(() => {
    setJsonMode(false);
  });

  it('returns an object with start/stop/succeed/fail methods', () => {
    const s = spinner('Loading...');
    expect(typeof s.start).toBe('function');
    expect(typeof s.stop).toBe('function');
    expect(typeof s.succeed).toBe('function');
    expect(typeof s.fail).toBe('function');
    // Clean up — stop any running spinner
    s.stop();
  });

  it('returns a no-op spinner in JSON mode', () => {
    setJsonMode(true);
    const s = spinner('Loading...');
    // Should not throw and methods should be callable
    expect(() => s.start()).not.toThrow();
    expect(() => s.stop()).not.toThrow();
    expect(() => s.succeed('done')).not.toThrow();
    expect(() => s.fail('error')).not.toThrow();
  });

  it('no-op spinner start returns itself for chaining', () => {
    setJsonMode(true);
    const s = spinner('Loading...');
    const result = s.start();
    expect(result).toBe(s);
  });
});

// ---------------------------------------------------------------------------
// error
// ---------------------------------------------------------------------------

describe('error', () => {
  beforeEach(() => {
    captureStderr();
  });

  afterEach(() => {
    stderrWriteSpy.mockRestore();
  });

  it('prints message to stderr', () => {
    error('Something went wrong');
    const output = stderrWrites.join('');
    expect(output).toContain('Something went wrong');
  });

  it('includes a newline at the end', () => {
    error('test error');
    const output = stderrWrites.join('');
    expect(output.endsWith('\n')).toBe(true);
  });
});
