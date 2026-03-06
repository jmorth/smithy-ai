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
  renderSummary,
  renderLineDetail,
  renderPoolDetail,
  fetchAndRender,
  parseInterval,
  watchLoop,
} from './status.js';
import type { AssemblyLine, WorkerPool } from '@smithy/shared';

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

const MOCK_LINE: AssemblyLine = {
  id: 'line-1',
  name: 'Review Pipeline',
  slug: 'review-pipeline',
  description: 'A pipeline for code review',
  status: 'active',
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-06T00:00:00Z',
};

const MOCK_LINE_2: AssemblyLine = {
  id: 'line-2',
  name: 'Build Pipeline',
  slug: 'build-pipeline',
  status: 'pending',
  createdAt: '2026-03-02T00:00:00Z',
  updatedAt: '2026-03-06T00:00:00Z',
};

const MOCK_POOL: WorkerPool = {
  id: 'pool-1',
  name: 'Summarizer Pool',
  slug: 'summarizer-pool',
  description: 'Pool of summarizer workers',
  status: 'healthy',
  maxConcurrency: 5,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-06T00:00:00Z',
};

const MOCK_POOL_2: WorkerPool = {
  id: 'pool-2',
  name: 'Reviewer Pool',
  slug: 'reviewer-pool',
  status: 'error',
  maxConcurrency: 3,
  createdAt: '2026-03-03T00:00:00Z',
  updatedAt: '2026-03-06T00:00:00Z',
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
// parseInterval
// ---------------------------------------------------------------------------

describe('parseInterval', () => {
  it('parses a valid integer', () => {
    expect(parseInterval('10')).toBe(10);
  });

  it('returns 5 for NaN', () => {
    expect(parseInterval('abc')).toBe(5);
  });

  it('returns 5 for zero', () => {
    expect(parseInterval('0')).toBe(5);
  });

  it('returns 5 for negative values', () => {
    expect(parseInterval('-3')).toBe(5);
  });

  it('parses 1 as minimum valid interval', () => {
    expect(parseInterval('1')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// renderSummary
// ---------------------------------------------------------------------------

describe('renderSummary', () => {
  it('renders a table with assembly lines and worker pools', () => {
    renderSummary([MOCK_LINE], [MOCK_POOL]);
    const out = stdout();
    expect(out).toContain('Review Pipeline');
    expect(out).toContain('line');
    expect(out).toContain('Summarizer Pool');
    expect(out).toContain('pool');
  });

  it('renders JSON when json mode is enabled', () => {
    setJsonMode(true);
    renderSummary([MOCK_LINE], [MOCK_POOL]);
    const parsed = JSON.parse(stdout());
    expect(parsed.assemblyLines).toHaveLength(1);
    expect(parsed.workerPools).toHaveLength(1);
    expect(parsed.assemblyLines[0].slug).toBe('review-pipeline');
    expect(parsed.workerPools[0].slug).toBe('summarizer-pool');
  });

  it('shows message when no lines or pools exist', () => {
    renderSummary([], []);
    expect(stdout()).toContain('No assembly lines or worker pools found');
  });

  it('renders multiple lines and pools', () => {
    renderSummary([MOCK_LINE, MOCK_LINE_2], [MOCK_POOL, MOCK_POOL_2]);
    const out = stdout();
    expect(out).toContain('Review Pipeline');
    expect(out).toContain('Build Pipeline');
    expect(out).toContain('Summarizer Pool');
    expect(out).toContain('Reviewer Pool');
  });
});

// ---------------------------------------------------------------------------
// renderLineDetail
// ---------------------------------------------------------------------------

describe('renderLineDetail', () => {
  it('renders assembly line details', () => {
    renderLineDetail(MOCK_LINE);
    const out = stdout();
    expect(out).toContain('Assembly Line: Review Pipeline');
    expect(out).toContain('Slug: review-pipeline');
    expect(out).toContain('Description: A pipeline for code review');
    expect(out).toContain('Created:');
    expect(out).toContain('Updated:');
  });

  it('omits description when not present', () => {
    renderLineDetail(MOCK_LINE_2);
    const out = stdout();
    expect(out).toContain('Assembly Line: Build Pipeline');
    expect(out).not.toContain('Description:');
  });

  it('renders JSON in json mode', () => {
    setJsonMode(true);
    renderLineDetail(MOCK_LINE);
    const parsed = JSON.parse(stdout());
    expect(parsed.slug).toBe('review-pipeline');
    expect(parsed.name).toBe('Review Pipeline');
  });
});

// ---------------------------------------------------------------------------
// renderPoolDetail
// ---------------------------------------------------------------------------

describe('renderPoolDetail', () => {
  it('renders worker pool details', () => {
    renderPoolDetail(MOCK_POOL);
    const out = stdout();
    expect(out).toContain('Worker Pool: Summarizer Pool');
    expect(out).toContain('Slug: summarizer-pool');
    expect(out).toContain('Description: Pool of summarizer workers');
    expect(out).toContain('Max Concurrency: 5');
    expect(out).toContain('Created:');
    expect(out).toContain('Updated:');
  });

  it('omits description when not present', () => {
    renderPoolDetail(MOCK_POOL_2);
    const out = stdout();
    expect(out).toContain('Worker Pool: Reviewer Pool');
    expect(out).not.toContain('Description:');
  });

  it('renders JSON in json mode', () => {
    setJsonMode(true);
    renderPoolDetail(MOCK_POOL);
    const parsed = JSON.parse(stdout());
    expect(parsed.slug).toBe('summarizer-pool');
    expect(parsed.maxConcurrency).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// fetchAndRender - summary mode
// ---------------------------------------------------------------------------

describe('fetchAndRender - summary mode', () => {
  it('fetches lines and pools in parallel and renders summary', async () => {
    mockFetchResponse({ data: [MOCK_LINE], total: 1, page: 1, limit: 20 });
    mockFetchResponse({ data: [MOCK_POOL], total: 1, page: 1, limit: 20 });

    const result = await fetchAndRender({});
    expect(result).toBe(true);
    expect(process.exitCode).toBe(0);

    const out = stdout();
    expect(out).toContain('Review Pipeline');
    expect(out).toContain('Summarizer Pool');
  });

  it('makes two fetch calls for summary mode', async () => {
    mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });
    mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });

    await fetchAndRender({});
    expect(fetchSpy.mock.calls).toHaveLength(2);
  });

  it('renders JSON in summary mode when json mode is set', async () => {
    setJsonMode(true);
    mockFetchResponse({ data: [MOCK_LINE], total: 1, page: 1, limit: 20 });
    mockFetchResponse({ data: [MOCK_POOL], total: 1, page: 1, limit: 20 });

    await fetchAndRender({});
    const parsed = JSON.parse(stdout());
    expect(parsed.assemblyLines).toHaveLength(1);
    expect(parsed.workerPools).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// fetchAndRender - line detail mode
// ---------------------------------------------------------------------------

describe('fetchAndRender - line detail mode', () => {
  it('fetches a specific assembly line', async () => {
    mockFetchResponse(MOCK_LINE);

    const result = await fetchAndRender({ line: 'review-pipeline' });
    expect(result).toBe(true);
    expect(stdout()).toContain('Assembly Line: Review Pipeline');
  });

  it('makes one fetch call for line detail', async () => {
    mockFetchResponse(MOCK_LINE);

    await fetchAndRender({ line: 'review-pipeline' });
    expect(fetchSpy.mock.calls).toHaveLength(1);

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/assembly-lines/review-pipeline');
  });

  it('handles 404 for unknown line slug', async () => {
    mockFetchError(404, { message: 'Not found' });

    const result = await fetchAndRender({ line: 'nonexistent' });
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Assembly line not found: nonexistent');
  });
});

// ---------------------------------------------------------------------------
// fetchAndRender - pool detail mode
// ---------------------------------------------------------------------------

describe('fetchAndRender - pool detail mode', () => {
  it('fetches a specific worker pool', async () => {
    mockFetchResponse(MOCK_POOL);

    const result = await fetchAndRender({ pool: 'summarizer-pool' });
    expect(result).toBe(true);
    expect(stdout()).toContain('Worker Pool: Summarizer Pool');
  });

  it('makes one fetch call for pool detail', async () => {
    mockFetchResponse(MOCK_POOL);

    await fetchAndRender({ pool: 'summarizer-pool' });
    expect(fetchSpy.mock.calls).toHaveLength(1);

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/worker-pools/summarizer-pool');
  });

  it('handles 404 for unknown pool slug', async () => {
    mockFetchError(404, { message: 'Not found' });

    const result = await fetchAndRender({ pool: 'nonexistent' });
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Worker pool not found: nonexistent');
  });
});

// ---------------------------------------------------------------------------
// fetchAndRender - error handling
// ---------------------------------------------------------------------------

describe('fetchAndRender - error handling', () => {
  it('errors when both --line and --pool are specified', async () => {
    const result = await fetchAndRender({ line: 'a', pool: 'b' });
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Cannot specify both --line and --pool');
  });

  it('handles generic API error with details', async () => {
    mockFetchError(422, {
      message: 'Validation failed',
      details: { slug: ['must be alphanumeric'] },
    });

    const result = await fetchAndRender({ line: 'bad!' });
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('API error (422)');
    expect(stderr()).toContain('Validation failed');
    expect(stderr()).toContain('slug');
    expect(stderr()).toContain('must be alphanumeric');
  });

  it('handles non-JSON API error', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    const result = await fetchAndRender({ line: 'test' });
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('API error (500)');
  });

  it('handles unexpected (non-API) errors', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failure'));

    const result = await fetchAndRender({ line: 'test' });
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Unexpected error: Network failure');
  });

  it('handles 404 in summary mode', async () => {
    mockFetchError(404, { message: 'Endpoint not found' });

    const result = await fetchAndRender({});
    expect(result).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Not found');
  });
});

// ---------------------------------------------------------------------------
// watchLoop
// ---------------------------------------------------------------------------

describe('watchLoop', () => {
  it('runs fetch and render in a loop and stops on abort', async () => {
    mockFetchResponse({ data: [MOCK_LINE], total: 1, page: 1, limit: 20 });
    mockFetchResponse({ data: [MOCK_POOL], total: 1, page: 1, limit: 20 });

    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);

    await watchLoop({}, 1, ac.signal);

    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('clears the screen on each iteration in non-json mode', async () => {
    mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });
    mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });

    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);

    await watchLoop({}, 1, ac.signal);

    expect(stdout()).toContain('\x1B[2J\x1B[H');
  });

  it('does not clear screen in json mode', async () => {
    setJsonMode(true);
    mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });
    mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });

    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);

    await watchLoop({}, 1, ac.signal);

    expect(stdout()).not.toContain('\x1B[2J');
  });

  it('works with line detail in watch mode', async () => {
    mockFetchResponse(MOCK_LINE);

    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);

    await watchLoop({ line: 'review-pipeline' }, 1, ac.signal);

    expect(stdout()).toContain('Review Pipeline');
  });
});

// ---------------------------------------------------------------------------
// run() - integration
// ---------------------------------------------------------------------------

describe('run - summary mode', () => {
  it('shows summary table with no flags', async () => {
    mockFetchResponse({ data: [MOCK_LINE], total: 1, page: 1, limit: 20 });
    mockFetchResponse({ data: [MOCK_POOL], total: 1, page: 1, limit: 20 });

    await run({}, makeMockCmd({}));

    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('Review Pipeline');
    expect(stdout()).toContain('Summarizer Pool');
  });

  it('exit code 0 on success', async () => {
    mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });
    mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });

    await run({}, makeMockCmd({}));
    expect(process.exitCode).toBe(0);
  });
});

describe('run - line detail mode', () => {
  it('shows line detail with --line flag', async () => {
    mockFetchResponse(MOCK_LINE);

    await run({}, makeMockCmd({ line: 'review-pipeline' }));

    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('Assembly Line: Review Pipeline');
  });

  it('exit code 1 on 404', async () => {
    mockFetchError(404, { message: 'Not found' });

    await run({}, makeMockCmd({ line: 'nonexistent' }));

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Assembly line not found');
  });
});

describe('run - pool detail mode', () => {
  it('shows pool detail with --pool flag', async () => {
    mockFetchResponse(MOCK_POOL);

    await run({}, makeMockCmd({ pool: 'summarizer-pool' }));

    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('Worker Pool: Summarizer Pool');
  });

  it('exit code 1 on 404', async () => {
    mockFetchError(404, { message: 'Not found' });

    await run({}, makeMockCmd({ pool: 'nonexistent' }));

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Worker pool not found');
  });
});

describe('run - validation', () => {
  it('errors when both --line and --pool are provided', async () => {
    await run({}, makeMockCmd({ line: 'a', pool: 'b' }));

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Cannot specify both --line and --pool');
  });
});

describe('run - JSON mode', () => {
  it('sets json mode from global opts for summary', async () => {
    mockFetchResponse({ data: [MOCK_LINE], total: 1, page: 1, limit: 20 });
    mockFetchResponse({ data: [MOCK_POOL], total: 1, page: 1, limit: 20 });

    await run({ json: true }, makeMockCmd({}));

    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(parsed.assemblyLines).toHaveLength(1);
    expect(parsed.workerPools).toHaveLength(1);
  });

  it('sets json mode from global opts for line detail', async () => {
    mockFetchResponse(MOCK_LINE);

    await run({ json: true }, makeMockCmd({ line: 'review-pipeline' }));

    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(parsed.slug).toBe('review-pipeline');
  });

  it('sets json mode from global opts for pool detail', async () => {
    mockFetchResponse(MOCK_POOL);

    await run({ json: true }, makeMockCmd({ pool: 'summarizer-pool' }));

    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(parsed.slug).toBe('summarizer-pool');
  });
});

describe('run - watch mode', () => {
  it('enters watch mode when --watch flag is set', async () => {
    mockFetchResponse({ data: [MOCK_LINE], total: 1, page: 1, limit: 20 });
    mockFetchResponse({ data: [MOCK_POOL], total: 1, page: 1, limit: 20 });

    const timeout = setTimeout(() => {
      process.emit('SIGINT' as any);
    }, 100);

    await run({}, makeMockCmd({ watch: true, interval: '1' }));

    clearTimeout(timeout);
    expect(stdout()).toContain('Review Pipeline');
  });

  it('uses default interval of 5 when not specified', async () => {
    mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });
    mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });

    const timeout = setTimeout(() => {
      process.emit('SIGINT' as any);
    }, 50);

    await run({}, makeMockCmd({ watch: true }));

    clearTimeout(timeout);
    expect(process.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CLI integration
// ---------------------------------------------------------------------------

describe('CLI integration', () => {
  it('status command registers --line, --pool, --watch, --interval flags', async () => {
    const { createProgram } = await import('../index.js');
    const program = createProgram();
    const statusCmd = program.commands.find((c) => c.name() === 'status');
    expect(statusCmd).toBeDefined();

    const optionNames = statusCmd!.options.map((o) => o.long);
    expect(optionNames).toContain('--line');
    expect(optionNames).toContain('--pool');
    expect(optionNames).toContain('--watch');
    expect(optionNames).toContain('--interval');
  });
});
