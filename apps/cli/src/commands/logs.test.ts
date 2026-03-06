import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
} from 'bun:test';
import { setJsonMode } from '../lib/output.js';
import { resetBaseUrl } from '../lib/api-client.js';
import type { JobLogEntry } from '../lib/api-client.js';
import {
  run,
  formatTimestamp,
  colorLevel,
  formatLogLine,
  filterByLevel,
  parseTail,
  fetchAndDisplayLogs,
  streamSSE,
} from './logs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let fetchSpy: ReturnType<typeof spyOn>;
let stdoutData: string[];
let stderrData: string[];
let stdoutSpy: ReturnType<typeof spyOn>;
let stderrSpy: ReturnType<typeof spyOn>;

function mockFetchResponse(body: unknown, status = 200) {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchError(
  status: number,
  body?: { message?: string; details?: Record<string, string[]> },
) {
  if (body) {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } else {
    fetchSpy.mockResolvedValueOnce(
      new Response('error', { status, statusText: 'Error' }),
    );
  }
}

function makeMockCmd(opts: Record<string, unknown> = {}) {
  return { opts: () => opts } as any;
}

function stdout(): string {
  return stdoutData.join('');
}

function stderr(): string {
  return stderrData.join('');
}

function makeLogEntry(overrides: Partial<JobLogEntry> = {}): JobLogEntry {
  return {
    id: 'log-1',
    jobId: 'job-123',
    level: 'info',
    message: 'Processing started',
    timestamp: '2026-03-06T10:30:45Z',
    ...overrides,
  };
}

function makeLogsResponse(
  entries: JobLogEntry[],
  total?: number,
  page = 1,
  limit = 100,
) {
  return {
    data: entries,
    total: total ?? entries.length,
    page,
    limit,
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  stdoutData = [];
  stderrData = [];
  stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(
    (chunk: string | Uint8Array) => {
      stdoutData.push(String(chunk));
      return true;
    },
  );
  stderrSpy = spyOn(process.stderr, 'write').mockImplementation(
    (chunk: string | Uint8Array) => {
      stderrData.push(String(chunk));
      return true;
    },
  );
  fetchSpy = spyOn(globalThis, 'fetch');
  resetBaseUrl();
  setJsonMode(false);
  process.exitCode = 0;
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  fetchSpy.mockRestore();
  setJsonMode(false);
  process.exitCode = 0;
});

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

describe('formatTimestamp', () => {
  it('formats ISO timestamp to HH:mm:ss in local time', () => {
    const result = formatTimestamp('2026-03-06T10:30:45Z');
    // Should be a time format like HH:mm:ss
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('returns original string for invalid dates', () => {
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
  });

  it('pads single-digit hours/minutes/seconds', () => {
    // Using a UTC midnight which may translate differently in local time
    const result = formatTimestamp('2026-01-01T00:05:09Z');
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// colorLevel
// ---------------------------------------------------------------------------

describe('colorLevel', () => {
  it('returns yellow for warn', () => {
    const result = colorLevel('warn');
    expect(result).toContain('WARN');
  });

  it('returns red for error', () => {
    const result = colorLevel('error');
    expect(result).toContain('ERROR');
  });

  it('returns white for info', () => {
    const result = colorLevel('info');
    expect(result).toContain('INFO');
  });

  it('handles uppercase input', () => {
    const result = colorLevel('WARN');
    expect(result).toContain('WARN');
  });

  it('returns white for unknown levels', () => {
    const result = colorLevel('debug');
    expect(result).toContain('DEBUG');
  });
});

// ---------------------------------------------------------------------------
// formatLogLine
// ---------------------------------------------------------------------------

describe('formatLogLine', () => {
  it('formats log entry as [TIMESTAMP] [LEVEL] MESSAGE', () => {
    const entry = makeLogEntry({ message: 'Hello world' });
    const result = formatLogLine(entry);
    expect(result).toContain('] [');
    expect(result).toContain('Hello world');
    expect(result).toContain('INFO');
  });

  it('uses colored level in output', () => {
    const entry = makeLogEntry({ level: 'error', message: 'fail' });
    const result = formatLogLine(entry);
    expect(result).toContain('ERROR');
    expect(result).toContain('fail');
  });
});

// ---------------------------------------------------------------------------
// filterByLevel
// ---------------------------------------------------------------------------

describe('filterByLevel', () => {
  const entries: JobLogEntry[] = [
    makeLogEntry({ id: '1', level: 'info', message: 'info msg' }),
    makeLogEntry({ id: '2', level: 'warn', message: 'warn msg' }),
    makeLogEntry({ id: '3', level: 'error', message: 'error msg' }),
  ];

  it('returns all entries when level is info', () => {
    const result = filterByLevel(entries, 'info');
    expect(result).toHaveLength(3);
  });

  it('returns warn and error when level is warn', () => {
    const result = filterByLevel(entries, 'warn');
    expect(result).toHaveLength(2);
    expect(result[0]!.level).toBe('warn');
    expect(result[1]!.level).toBe('error');
  });

  it('returns only error when level is error', () => {
    const result = filterByLevel(entries, 'error');
    expect(result).toHaveLength(1);
    expect(result[0]!.level).toBe('error');
  });

  it('returns all entries for unknown level (defaults to severity 0)', () => {
    const result = filterByLevel(entries, 'unknown');
    expect(result).toHaveLength(3);
  });

  it('handles entries with unknown levels', () => {
    const mixed = [
      makeLogEntry({ id: '1', level: 'debug', message: 'debug' }),
      makeLogEntry({ id: '2', level: 'warn', message: 'warn' }),
    ];
    const result = filterByLevel(mixed, 'warn');
    expect(result).toHaveLength(1);
    expect(result[0]!.level).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// parseTail
// ---------------------------------------------------------------------------

describe('parseTail', () => {
  it('returns undefined for undefined', () => {
    expect(parseTail(undefined)).toBeUndefined();
  });

  it('parses a valid integer', () => {
    expect(parseTail('10')).toBe(10);
  });

  it('returns undefined for zero', () => {
    expect(parseTail('0')).toBeUndefined();
  });

  it('returns undefined for negative values', () => {
    expect(parseTail('-5')).toBeUndefined();
  });

  it('returns undefined for non-numeric strings', () => {
    expect(parseTail('abc')).toBeUndefined();
  });

  it('parses 1 as valid', () => {
    expect(parseTail('1')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// fetchAndDisplayLogs
// ---------------------------------------------------------------------------

describe('fetchAndDisplayLogs', () => {
  it('fetches and displays logs for a job', async () => {
    const entries = [
      makeLogEntry({ id: '1', level: 'info', message: 'First log' }),
      makeLogEntry({ id: '2', level: 'warn', message: 'Second log' }),
    ];
    mockFetchResponse(makeLogsResponse(entries));

    const result = await fetchAndDisplayLogs('job-123', {});
    expect(result).toBe(true);
    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('First log');
    expect(stdout()).toContain('Second log');
  });

  it('formats log lines with timestamp and level', async () => {
    mockFetchResponse(
      makeLogsResponse([makeLogEntry({ message: 'Test message' })]),
    );

    await fetchAndDisplayLogs('job-123', {});
    const out = stdout();
    expect(out).toContain('[');
    expect(out).toContain('INFO');
    expect(out).toContain('Test message');
  });

  it('shows "No log entries found" when empty', async () => {
    mockFetchResponse(makeLogsResponse([]));

    await fetchAndDisplayLogs('job-123', {});
    expect(stdout()).toContain('No log entries found');
  });

  it('filters logs by level', async () => {
    const entries = [
      makeLogEntry({ id: '1', level: 'info', message: 'info msg' }),
      makeLogEntry({ id: '2', level: 'error', message: 'error msg' }),
    ];
    mockFetchResponse(makeLogsResponse(entries));

    await fetchAndDisplayLogs('job-123', { level: 'error' });
    const out = stdout();
    expect(out).not.toContain('info msg');
    expect(out).toContain('error msg');
  });

  it('applies tail to show last N entries', async () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeLogEntry({ id: `${i}`, message: `Log ${i}` }),
    );
    mockFetchResponse(makeLogsResponse(entries));

    await fetchAndDisplayLogs('job-123', { tail: '2' });
    const out = stdout();
    expect(out).not.toContain('Log 0');
    expect(out).not.toContain('Log 2');
    expect(out).toContain('Log 3');
    expect(out).toContain('Log 4');
  });

  it('applies level filter before tail', async () => {
    const entries = [
      makeLogEntry({ id: '1', level: 'info', message: 'info 1' }),
      makeLogEntry({ id: '2', level: 'warn', message: 'warn 1' }),
      makeLogEntry({ id: '3', level: 'info', message: 'info 2' }),
      makeLogEntry({ id: '4', level: 'warn', message: 'warn 2' }),
      makeLogEntry({ id: '5', level: 'error', message: 'error 1' }),
    ];
    mockFetchResponse(makeLogsResponse(entries));

    await fetchAndDisplayLogs('job-123', { level: 'warn', tail: '2' });
    const out = stdout();
    expect(out).not.toContain('warn 1');
    expect(out).toContain('warn 2');
    expect(out).toContain('error 1');
  });

  it('handles invalid level', async () => {
    const result = await fetchAndDisplayLogs('job-123', { level: 'invalid' });
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Invalid log level: invalid');
  });

  it('handles 404 with clear error message', async () => {
    mockFetchError(404, { message: 'Not found' });

    const result = await fetchAndDisplayLogs('job-123', {});
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Job not found: job-123');
  });

  it('handles generic API errors', async () => {
    mockFetchError(500, { message: 'Internal server error' });

    const result = await fetchAndDisplayLogs('job-123', {});
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('API error (500)');
    expect(stderr()).toContain('Internal server error');
  });

  it('handles API errors with validation details', async () => {
    mockFetchError(422, {
      message: 'Validation failed',
      details: { jobId: ['must be a UUID'] },
    });

    const result = await fetchAndDisplayLogs('bad-id', {});
    expect(result).toBe(false);
    expect(stderr()).toContain('API error (422)');
    expect(stderr()).toContain('jobId');
    expect(stderr()).toContain('must be a UUID');
  });

  it('handles non-JSON API errors', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    const result = await fetchAndDisplayLogs('job-123', {});
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('API error (500)');
  });

  it('handles unexpected (non-API) errors', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failure'));

    const result = await fetchAndDisplayLogs('job-123', {});
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Unexpected error: Network failure');
  });

  it('paginates through all logs', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      makeLogEntry({ id: `p1-${i}`, message: `Page1-Log${i}` }),
    );
    const page2 = [
      makeLogEntry({ id: 'p2-0', message: 'Page2-Log0' }),
    ];
    mockFetchResponse(makeLogsResponse(page1, 101, 1, 100));
    mockFetchResponse(makeLogsResponse(page2, 101, 2, 100));

    const result = await fetchAndDisplayLogs('job-123', {});
    expect(result).toBe(true);
    expect(fetchSpy.mock.calls).toHaveLength(2);
    expect(stdout()).toContain('Page1-Log0');
    expect(stdout()).toContain('Page2-Log0');
  });
});

// ---------------------------------------------------------------------------
// fetchAndDisplayLogs - JSON mode
// ---------------------------------------------------------------------------

describe('fetchAndDisplayLogs - JSON mode', () => {
  it('outputs NDJSON in json mode', async () => {
    setJsonMode(true);
    const entries = [
      makeLogEntry({ id: '1', message: 'first' }),
      makeLogEntry({ id: '2', message: 'second' }),
    ];
    mockFetchResponse(makeLogsResponse(entries));

    await fetchAndDisplayLogs('job-123', {});
    const lines = stdout().trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed1 = JSON.parse(lines[0]!);
    const parsed2 = JSON.parse(lines[1]!);
    expect(parsed1.message).toBe('first');
    expect(parsed2.message).toBe('second');
  });

  it('preserves full ISO timestamp in JSON output', async () => {
    setJsonMode(true);
    mockFetchResponse(
      makeLogsResponse([
        makeLogEntry({ timestamp: '2026-03-06T10:30:45Z' }),
      ]),
    );

    await fetchAndDisplayLogs('job-123', {});
    const parsed = JSON.parse(stdout().trim());
    expect(parsed.timestamp).toBe('2026-03-06T10:30:45Z');
  });

  it('applies level filter in JSON mode', async () => {
    setJsonMode(true);
    const entries = [
      makeLogEntry({ id: '1', level: 'info', message: 'info' }),
      makeLogEntry({ id: '2', level: 'error', message: 'err' }),
    ];
    mockFetchResponse(makeLogsResponse(entries));

    await fetchAndDisplayLogs('job-123', { level: 'error' });
    const lines = stdout().trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).level).toBe('error');
  });

  it('applies tail in JSON mode', async () => {
    setJsonMode(true);
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeLogEntry({ id: `${i}`, message: `m${i}` }),
    );
    mockFetchResponse(makeLogsResponse(entries));

    await fetchAndDisplayLogs('job-123', { tail: '2' });
    const lines = stdout().trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).message).toBe('m3');
    expect(JSON.parse(lines[1]!).message).toBe('m4');
  });
});

// ---------------------------------------------------------------------------
// streamSSE
// ---------------------------------------------------------------------------

describe('streamSSE', () => {
  it('parses SSE data lines and prints formatted log entries', async () => {
    const entry = makeLogEntry({ message: 'streaming log' });
    const sseBody = `data: ${JSON.stringify(entry)}\n\n`;

    fetchSpy.mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const ac = new AbortController();
    await streamSSE('job-123', 'info', ac.signal);

    expect(stdout()).toContain('streaming log');
    expect(stdout()).toContain('INFO');
  });

  it('filters SSE entries by level', async () => {
    const infoEntry = makeLogEntry({ level: 'info', message: 'info sse' });
    const errorEntry = makeLogEntry({ level: 'error', message: 'error sse' });
    const sseBody =
      `data: ${JSON.stringify(infoEntry)}\n\ndata: ${JSON.stringify(errorEntry)}\n\n`;

    fetchSpy.mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const ac = new AbortController();
    await streamSSE('job-123', 'error', ac.signal);

    expect(stdout()).not.toContain('info sse');
    expect(stdout()).toContain('error sse');
  });

  it('outputs NDJSON in JSON mode for SSE', async () => {
    setJsonMode(true);
    const entry = makeLogEntry({ message: 'json sse' });
    const sseBody = `data: ${JSON.stringify(entry)}\n\n`;

    fetchSpy.mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const ac = new AbortController();
    await streamSSE('job-123', 'info', ac.signal);

    const parsed = JSON.parse(stdout().trim());
    expect(parsed.message).toBe('json sse');
  });

  it('handles SSE connection failure gracefully', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Not found', { status: 404 }),
    );

    const ac = new AbortController();
    await streamSSE('job-123', 'info', ac.signal);

    expect(stderr()).toContain('SSE connection failed: HTTP 404');
  });

  it('handles fetch error gracefully', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Connection refused'));

    const ac = new AbortController();
    await streamSSE('job-123', 'info', ac.signal);

    expect(stderr()).toContain('SSE connection failed: Connection refused');
  });

  it('does not print error when aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    fetchSpy.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    await streamSSE('job-123', 'info', ac.signal);

    expect(stderr()).toBe('');
  });

  it('handles response with no body', async () => {
    // Create a response that reports body as null
    const res = new Response(null, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    Object.defineProperty(res, 'body', { value: null });
    fetchSpy.mockResolvedValueOnce(res);

    const ac = new AbortController();
    await streamSSE('job-123', 'info', ac.signal);

    expect(stderr()).toContain('SSE connection returned no body');
  });

  it('skips malformed SSE data', async () => {
    const sseBody = `data: not valid json\n\ndata: ${JSON.stringify(makeLogEntry({ message: 'good' }))}\n\n`;

    fetchSpy.mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const ac = new AbortController();
    await streamSSE('job-123', 'info', ac.signal);

    expect(stdout()).toContain('good');
    // No error printed for malformed data
  });

  it('handles stream read errors', async () => {
    // Create a stream that errors during read
    const errorStream = new ReadableStream({
      start(controller) {
        controller.error(new Error('Stream broken'));
      },
    });
    fetchSpy.mockResolvedValueOnce(
      new Response(errorStream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const ac = new AbortController();
    await streamSSE('job-123', 'info', ac.signal);

    expect(stderr()).toContain('SSE stream error: Stream broken');
  });

  it('constructs correct SSE URL', async () => {
    const sseBody = '';
    fetchSpy.mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const ac = new AbortController();
    await streamSSE('job-456', 'info', ac.signal);

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain('/jobs/job-456/logs/stream');
  });
});

// ---------------------------------------------------------------------------
// run() - integration
// ---------------------------------------------------------------------------

describe('run - basic', () => {
  it('errors when no job ID provided', async () => {
    await run({}, makeMockCmd({}));
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Job ID is required');
  });

  it('fetches and displays logs for a job', async () => {
    const entries = [
      makeLogEntry({ message: 'Hello from run' }),
    ];
    mockFetchResponse(makeLogsResponse(entries));

    await run({}, makeMockCmd({}), 'job-123');
    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('Hello from run');
  });

  it('exit code 0 on success', async () => {
    mockFetchResponse(makeLogsResponse([]));

    await run({}, makeMockCmd({}), 'job-123');
    expect(process.exitCode).toBe(0);
  });

  it('exit code 1 on API error', async () => {
    mockFetchError(500, { message: 'Server Error' });

    await run({}, makeMockCmd({}), 'job-123');
    expect(process.exitCode).toBe(1);
  });
});

describe('run - JSON mode', () => {
  it('sets json mode from global opts', async () => {
    setJsonMode(false);
    const entries = [makeLogEntry({ message: 'json test' })];
    mockFetchResponse(makeLogsResponse(entries));

    await run({ json: true }, makeMockCmd({}), 'job-123');

    const parsed = JSON.parse(stdout().trim());
    expect(parsed.message).toBe('json test');
  });
});

describe('run - level filter', () => {
  it('passes level option through', async () => {
    const entries = [
      makeLogEntry({ id: '1', level: 'info', message: 'info' }),
      makeLogEntry({ id: '2', level: 'error', message: 'err' }),
    ];
    mockFetchResponse(makeLogsResponse(entries));

    await run({}, makeMockCmd({ level: 'error' }), 'job-123');

    const out = stdout();
    expect(out).not.toContain('info');
    expect(out).toContain('err');
  });

  it('uses info as default level', async () => {
    const entries = [
      makeLogEntry({ id: '1', level: 'info', message: 'info msg' }),
    ];
    mockFetchResponse(makeLogsResponse(entries));

    await run({}, makeMockCmd({}), 'job-123');
    expect(stdout()).toContain('info msg');
  });
});

describe('run - 404 handling', () => {
  it('shows Job not found for 404', async () => {
    mockFetchError(404, { message: 'Not found' });

    await run({}, makeMockCmd({}), 'nonexistent-job');
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Job not found: nonexistent-job');
  });
});

describe('run - follow mode', () => {
  it('enters follow mode and streams SSE', async () => {
    // First: fetch existing logs
    mockFetchResponse(makeLogsResponse([]));

    // Second: SSE stream
    const entry = makeLogEntry({ message: 'live log' });
    const sseBody = `data: ${JSON.stringify(entry)}\n\n`;
    fetchSpy.mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    await run({}, makeMockCmd({ follow: true }), 'job-123');

    expect(stdout()).toContain('live log');
  });

  it('cleans up SIGINT handler after follow completes', async () => {
    mockFetchResponse(makeLogsResponse([]));

    fetchSpy.mockResolvedValueOnce(
      new Response('', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const listenerCountBefore = process.listenerCount('SIGINT');
    await run({}, makeMockCmd({ follow: true }), 'job-123');
    const listenerCountAfter = process.listenerCount('SIGINT');

    expect(listenerCountAfter).toBe(listenerCountBefore);
  });

  it('does not enter follow mode when fetch fails', async () => {
    mockFetchError(404, { message: 'Not found' });

    await run({}, makeMockCmd({ follow: true }), 'job-123');

    expect(process.exitCode).toBe(1);
    // Only 1 fetch call (the initial log fetch), no SSE call
    expect(fetchSpy.mock.calls).toHaveLength(1);
  });
});

describe('run - tail option', () => {
  it('shows only last N entries', async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeLogEntry({ id: `${i}`, message: `Entry ${i}` }),
    );
    mockFetchResponse(makeLogsResponse(entries));

    await run({}, makeMockCmd({ tail: '3' }), 'job-123');

    const out = stdout();
    expect(out).not.toContain('Entry 6');
    expect(out).toContain('Entry 7');
    expect(out).toContain('Entry 8');
    expect(out).toContain('Entry 9');
  });
});

// ---------------------------------------------------------------------------
// CLI integration
// ---------------------------------------------------------------------------

describe('CLI integration', () => {
  it('logs command registers job-id argument and all options', async () => {
    const { createProgram } = await import('../index.js');
    const program = createProgram();
    const logsCmd = program.commands.find((c) => c.name() === 'logs');
    expect(logsCmd).toBeDefined();

    const optionNames = logsCmd!.options.map((o) => o.long);
    expect(optionNames).toContain('--follow');
    expect(optionNames).toContain('--level');
    expect(optionNames).toContain('--tail');

    // Check it has the job-id argument
    const args = logsCmd!.registeredArguments;
    expect(args).toHaveLength(1);
    expect(args[0]!.name()).toBe('job-id');
    expect(args[0]!.required).toBe(true);
  });
});
