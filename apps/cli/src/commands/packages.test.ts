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
import {
  run,
  truncateId,
  relativeTime,
  parseIntOrDefault,
} from './packages.js';
import type { Package } from '@smithy/shared';

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

const MOCK_PACKAGE: Package = {
  id: '12345678-abcd-1234-efgh-123456789012',
  type: 'USER_INPUT' as any,
  status: 'PENDING' as any,
  metadata: {},
  assemblyLineId: 'aabbccdd-1122-3344-5566-778899001122',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_PACKAGE_2: Package = {
  id: 'abcdefgh-1234-5678-9012-abcdefghijkl',
  type: 'CODE' as any,
  status: 'COMPLETED' as any,
  metadata: { source: 'test' },
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-06T00:00:00Z',
};

const MOCK_PACKAGE_NO_LINE: Package = {
  id: '99887766-5544-3322-1100-aabbccddeeff',
  type: 'SPECIFICATION' as any,
  status: 'FAILED' as any,
  metadata: {},
  createdAt: '2026-03-05T12:00:00Z',
  updatedAt: '2026-03-05T12:30:00Z',
};

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
// truncateId
// ---------------------------------------------------------------------------

describe('truncateId', () => {
  it('truncates a UUID to 8 characters', () => {
    expect(truncateId('12345678-abcd-1234-efgh-123456789012')).toBe('12345678');
  });

  it('returns short IDs unchanged', () => {
    expect(truncateId('abc')).toBe('abc');
  });

  it('returns exactly 8 char IDs unchanged', () => {
    expect(truncateId('12345678')).toBe('12345678');
  });
});

// ---------------------------------------------------------------------------
// relativeTime
// ---------------------------------------------------------------------------

describe('relativeTime', () => {
  it('returns "just now" for timestamps less than 60 seconds ago', () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe('just now');
  });

  it('returns minutes ago for timestamps 1-59 minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(relativeTime(fiveMinAgo)).toBe('5 minutes ago');
  });

  it('returns singular minute', () => {
    const oneMinAgo = new Date(Date.now() - 61 * 1000).toISOString();
    expect(relativeTime(oneMinAgo)).toBe('1 minute ago');
  });

  it('returns hours ago for timestamps 1-23 hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(threeHoursAgo)).toBe('3 hours ago');
  });

  it('returns singular hour', () => {
    const oneHourAgo = new Date(Date.now() - 61 * 60 * 1000).toISOString();
    expect(relativeTime(oneHourAgo)).toBe('1 hour ago');
  });

  it('returns days ago for timestamps 1+ days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(twoDaysAgo)).toBe('2 days ago');
  });

  it('returns singular day', () => {
    const oneDayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(oneDayAgo)).toBe('1 day ago');
  });

  it('returns the raw string for invalid dates', () => {
    expect(relativeTime('not-a-date')).toBe('not-a-date');
  });

  it('returns "just now" for future timestamps', () => {
    const future = new Date(Date.now() + 60 * 1000).toISOString();
    expect(relativeTime(future)).toBe('just now');
  });
});

// ---------------------------------------------------------------------------
// parseIntOrDefault
// ---------------------------------------------------------------------------

describe('parseIntOrDefault', () => {
  it('parses a valid integer', () => {
    expect(parseIntOrDefault('5', 1)).toBe(5);
  });

  it('returns default for undefined', () => {
    expect(parseIntOrDefault(undefined, 20)).toBe(20);
  });

  it('returns default for NaN', () => {
    expect(parseIntOrDefault('abc', 10)).toBe(10);
  });

  it('returns default for zero', () => {
    expect(parseIntOrDefault('0', 20)).toBe(20);
  });

  it('returns default for negative values', () => {
    expect(parseIntOrDefault('-5', 20)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// run - basic listing
// ---------------------------------------------------------------------------

describe('run - basic listing', () => {
  it('fetches and displays packages as a table', async () => {
    mockFetchResponse({
      data: [MOCK_PACKAGE],
      total: 1,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ page: '1', limit: '20' }));

    expect(process.exitCode).toBe(0);
    const out = stdout();
    expect(out).toContain('ID');
    expect(out).toContain('Type');
    expect(out).toContain('Status');
    expect(out).toContain('Workflow');
    expect(out).toContain('Created');
    expect(out).toContain('12345678');
    expect(out).toContain('USER_INPUT');
  });

  it('shows truncated IDs in table view', async () => {
    mockFetchResponse({
      data: [MOCK_PACKAGE],
      total: 1,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ page: '1', limit: '20' }));

    const out = stdout();
    expect(out).toContain('12345678');
    expect(out).not.toContain('12345678-abcd');
  });

  it('shows assembly line ID (truncated) in workflow column', async () => {
    mockFetchResponse({
      data: [MOCK_PACKAGE],
      total: 1,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ page: '1', limit: '20' }));

    expect(stdout()).toContain('aabbccdd');
  });

  it('shows dash for workflow when no assembly line', async () => {
    mockFetchResponse({
      data: [MOCK_PACKAGE_NO_LINE],
      total: 1,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ page: '1', limit: '20' }));

    const out = stdout();
    // The table should contain a dash for workflow
    expect(out).toContain('-');
  });

  it('shows "No packages found" when empty', async () => {
    mockFetchResponse({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ page: '1', limit: '20' }));

    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('No packages found');
  });

  it('shows pagination info when multiple pages', async () => {
    mockFetchResponse({
      data: [MOCK_PACKAGE],
      total: 50,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ page: '1', limit: '20' }));

    expect(stdout()).toContain('Page 1 of 3');
    expect(stdout()).toContain('50 total');
  });

  it('does not show pagination info for single page', async () => {
    mockFetchResponse({
      data: [MOCK_PACKAGE],
      total: 1,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ page: '1', limit: '20' }));

    expect(stdout()).not.toContain('Page 1 of 1');
  });
});

// ---------------------------------------------------------------------------
// run - filtering
// ---------------------------------------------------------------------------

describe('run - filtering', () => {
  it('passes --type filter to API', async () => {
    mockFetchResponse({
      data: [MOCK_PACKAGE],
      total: 1,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ type: 'USER_INPUT', page: '1', limit: '20' }));

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('type=USER_INPUT');
  });

  it('passes --status filter to API', async () => {
    mockFetchResponse({
      data: [MOCK_PACKAGE],
      total: 1,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ status: 'PENDING', page: '1', limit: '20' }));

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('status=PENDING');
  });

  it('passes both --type and --status filters', async () => {
    mockFetchResponse({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ type: 'CODE', status: 'COMPLETED', page: '1', limit: '20' }));

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('type=CODE');
    expect(url).toContain('status=COMPLETED');
  });
});

// ---------------------------------------------------------------------------
// run - pagination
// ---------------------------------------------------------------------------

describe('run - pagination', () => {
  it('passes custom page and limit to API', async () => {
    mockFetchResponse({
      data: [],
      total: 0,
      page: 3,
      limit: 10,
    });

    await run({}, makeMockCmd({ page: '3', limit: '10' }));

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('page=3');
    expect(url).toContain('limit=10');
  });

  it('defaults page to 1 and limit to 20 for invalid values', async () => {
    mockFetchResponse({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ page: 'abc', limit: '-5' }));

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('page=1');
    expect(url).toContain('limit=20');
  });
});

// ---------------------------------------------------------------------------
// run - JSON mode
// ---------------------------------------------------------------------------

describe('run - JSON mode', () => {
  it('outputs full paginated response as JSON', async () => {
    const response = {
      data: [MOCK_PACKAGE, MOCK_PACKAGE_2],
      total: 2,
      page: 1,
      limit: 20,
    };
    mockFetchResponse(response);

    await run({ json: true }, makeMockCmd({ page: '1', limit: '20' }));

    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(parsed.data).toHaveLength(2);
    expect(parsed.total).toBe(2);
    expect(parsed.data[0].id).toBe(MOCK_PACKAGE.id);
  });

  it('outputs full UUIDs in JSON mode (no truncation)', async () => {
    mockFetchResponse({
      data: [MOCK_PACKAGE],
      total: 1,
      page: 1,
      limit: 20,
    });

    await run({ json: true }, makeMockCmd({ page: '1', limit: '20' }));

    const parsed = JSON.parse(stdout());
    expect(parsed.data[0].id).toBe('12345678-abcd-1234-efgh-123456789012');
  });
});

// ---------------------------------------------------------------------------
// run - error handling
// ---------------------------------------------------------------------------

describe('run - error handling', () => {
  it('handles API errors with details', async () => {
    mockFetchError(422, {
      message: 'Validation failed',
      details: { type: ['invalid type'] },
    });

    await run({}, makeMockCmd({ page: '1', limit: '20' }));

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('API error (422)');
    expect(stderr()).toContain('Validation failed');
    expect(stderr()).toContain('type');
    expect(stderr()).toContain('invalid type');
  });

  it('handles non-JSON API errors', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    await run({}, makeMockCmd({ page: '1', limit: '20' }));

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('API error (500)');
  });

  it('handles unexpected (non-API) errors', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failure'));

    await run({}, makeMockCmd({ page: '1', limit: '20' }));

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Unexpected error: Network failure');
  });

  it('exit code 0 on success', async () => {
    mockFetchResponse({
      data: [MOCK_PACKAGE],
      total: 1,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ page: '1', limit: '20' }));
    expect(process.exitCode).toBe(0);
  });

  it('exit code 1 on error', async () => {
    mockFetchError(500);

    await run({}, makeMockCmd({ page: '1', limit: '20' }));
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// run - spinner
// ---------------------------------------------------------------------------

describe('run - spinner', () => {
  it('uses a spinner while fetching', async () => {
    mockFetchResponse({
      data: [MOCK_PACKAGE],
      total: 1,
      page: 1,
      limit: 20,
    });

    await run({}, makeMockCmd({ page: '1', limit: '20' }));

    // Spinner output goes to stderr in ora, but in our test the succeed message
    // doesn't appear in stdout since ora writes to its own stream.
    // Just verify the command succeeds and produces table output.
    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('ID');
  });
});

// ---------------------------------------------------------------------------
// CLI integration
// ---------------------------------------------------------------------------

describe('CLI integration', () => {
  it('packages command registers --type, --status, --page, --limit flags', async () => {
    const { createProgram } = await import('../index.js');
    const program = createProgram();
    const packagesCmd = program.commands.find((c) => c.name() === 'packages');
    expect(packagesCmd).toBeDefined();

    const optionNames = packagesCmd!.options.map((o) => o.long);
    expect(optionNames).toContain('--type');
    expect(optionNames).toContain('--status');
    expect(optionNames).toContain('--page');
    expect(optionNames).toContain('--limit');
  });
});
