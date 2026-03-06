import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from 'bun:test';
import {
  packages,
  workers,
  assemblyLines,
  workerPools,
  jobs,
  resolveBaseUrl,
  resetBaseUrl,
  CliApiError,
} from './api-client.js';
import type {
  ListParams,
  PaginatedResponse,
  CreatePackageData,
  SubmitPackageData,
  JobLogsParams,
} from './api-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let fetchSpy: ReturnType<typeof spyOn>;
let originalEnv: string | undefined;

function mockFetchResponse(body: unknown, status = 200, statusText = 'OK') {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      statusText,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetch204() {
  fetchSpy.mockResolvedValueOnce(
    new Response(null, { status: 204, statusText: 'No Content' }),
  );
}

function mockFetchError(
  status: number,
  body?: { message?: string; details?: Record<string, string[]> },
  statusText = 'Error',
) {
  const responseInit: ResponseInit = { status, statusText };
  if (body) {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        ...responseInit,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } else {
    fetchSpy.mockResolvedValueOnce(
      new Response('not json', responseInit),
    );
  }
}

function lastFetchCall(): { url: string; init: RequestInit } {
  const calls = fetchSpy.mock.calls;
  const last = calls[calls.length - 1];
  return { url: last[0] as string, init: last[1] as RequestInit };
}

// ---------------------------------------------------------------------------
// Mock fs/promises.readFile for config file tests
// ---------------------------------------------------------------------------

// We mock the module so loadConfigApiUrl sees our fake config.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadFile = mock((): any => Promise.reject(new Error('no config')));
mock.module('fs/promises', () => ({
  readFile: mockReadFile,
}));

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetBaseUrl();
  originalEnv = process.env['SMITHY_API_URL'];
  delete process.env['SMITHY_API_URL'];
  fetchSpy = spyOn(globalThis, 'fetch');
  mockReadFile.mockReset();
  mockReadFile.mockRejectedValue(new Error('no config'));
});

afterEach(() => {
  fetchSpy.mockRestore();
  if (originalEnv !== undefined) {
    process.env['SMITHY_API_URL'] = originalEnv;
  } else {
    delete process.env['SMITHY_API_URL'];
  }
});

// ---------------------------------------------------------------------------
// CliApiError
// ---------------------------------------------------------------------------

describe('CliApiError', () => {
  it('extends Error with correct name', () => {
    const err = new CliApiError(404, 'Not found');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CliApiError');
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('includes optional details', () => {
    const details = { name: ['must not be empty'] };
    const err = new CliApiError(422, 'Validation failed', details);
    expect(err.details).toEqual(details);
  });

  it('defaults details to undefined', () => {
    const err = new CliApiError(500, 'Internal error');
    expect(err.details).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Base URL Resolution
// ---------------------------------------------------------------------------

describe('resolveBaseUrl', () => {
  it('uses SMITHY_API_URL env var when set', async () => {
    process.env['SMITHY_API_URL'] = 'http://custom:9000/api';
    const url = await resolveBaseUrl();
    expect(url).toBe('http://custom:9000/api');
  });

  it('falls back to config file apiUrl', async () => {
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ apiUrl: 'http://config-host:8080/api' }),
    );
    const url = await resolveBaseUrl();
    expect(url).toBe('http://config-host:8080/api');
  });

  it('falls back to default when no env or config', async () => {
    const url = await resolveBaseUrl();
    expect(url).toBe('http://localhost:3000/api');
  });

  it('caches the resolved URL on subsequent calls', async () => {
    process.env['SMITHY_API_URL'] = 'http://cached:3000/api';
    await resolveBaseUrl();
    // Change env — should still return cached value
    process.env['SMITHY_API_URL'] = 'http://different:3000/api';
    const url = await resolveBaseUrl();
    expect(url).toBe('http://cached:3000/api');
  });

  it('resetBaseUrl clears the cache', async () => {
    process.env['SMITHY_API_URL'] = 'http://first:3000/api';
    await resolveBaseUrl();
    resetBaseUrl();
    process.env['SMITHY_API_URL'] = 'http://second:3000/api';
    const url = await resolveBaseUrl();
    expect(url).toBe('http://second:3000/api');
  });

  it('env var takes precedence over config file', async () => {
    // Config file would return a URL, but env var should win without reading it
    mockReadFile.mockResolvedValue(
      JSON.stringify({ apiUrl: 'http://config-loses:3000/api' }),
    );
    process.env['SMITHY_API_URL'] = 'http://env-wins:3000/api';
    const url = await resolveBaseUrl();
    expect(url).toBe('http://env-wins:3000/api');
  });

  it('ignores empty apiUrl in config file', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ apiUrl: '' }));
    const url = await resolveBaseUrl();
    expect(url).toBe('http://localhost:3000/api');
  });

  it('handles malformed config JSON gracefully', async () => {
    mockReadFile.mockResolvedValueOnce('not valid json{{{');
    const url = await resolveBaseUrl();
    expect(url).toBe('http://localhost:3000/api');
  });
});

// ---------------------------------------------------------------------------
// packages namespace
// ---------------------------------------------------------------------------

describe('packages', () => {
  describe('list', () => {
    it('sends GET /packages with no params', async () => {
      const body: PaginatedResponse<any> = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      };
      mockFetchResponse(body);
      const result = await packages.list();
      const { url, init } = lastFetchCall();
      expect(url).toBe('http://localhost:3000/api/packages');
      expect(init.method).toBe('GET');
      expect(result).toEqual(body);
    });

    it('sends query params for pagination and filter', async () => {
      const params: ListParams = {
        page: 2,
        limit: 10,
        sort: 'createdAt',
        filter: { status: 'COMPLETED', type: 'review' },
      };
      mockFetchResponse({ data: [], total: 0, page: 2, limit: 10 });
      await packages.list(params);
      const { url } = lastFetchCall();
      const parsed = new URL(url);
      expect(parsed.searchParams.get('page')).toBe('2');
      expect(parsed.searchParams.get('limit')).toBe('10');
      expect(parsed.searchParams.get('sort')).toBe('createdAt');
      expect(parsed.searchParams.get('status')).toBe('COMPLETED');
      expect(parsed.searchParams.get('type')).toBe('review');
    });

    it('omits undefined optional params', async () => {
      mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });
      await packages.list({ page: 1 });
      const { url } = lastFetchCall();
      const parsed = new URL(url);
      expect(parsed.searchParams.has('limit')).toBe(false);
      expect(parsed.searchParams.has('sort')).toBe(false);
    });
  });

  describe('get', () => {
    it('sends GET /packages/:id', async () => {
      const pkg = { id: 'abc-123', type: 'review', status: 'PENDING' } as const;
      mockFetchResponse(pkg);
      const result = await packages.get('abc-123');
      const { url, init } = lastFetchCall();
      expect(url).toBe('http://localhost:3000/api/packages/abc-123');
      expect(init.method).toBe('GET');
      expect(result).toEqual(pkg as any);
    });

    it('encodes special characters in id', async () => {
      mockFetchResponse({ id: 'a/b' });
      await packages.get('a/b');
      const { url } = lastFetchCall();
      expect(url).toContain('a%2Fb');
    });
  });

  describe('create', () => {
    it('sends POST /packages with body', async () => {
      const data: CreatePackageData = {
        type: 'review',
        metadata: { key: 'value' },
      };
      const created = { id: 'new-1', ...data, status: 'PENDING' };
      mockFetchResponse(created, 201);
      const result = await packages.create(data);
      const { url, init } = lastFetchCall();
      expect(url).toBe('http://localhost:3000/api/packages');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body as string)).toEqual(data);
      expect(result).toEqual(created as any);
    });

    it('includes assemblyLineId when provided', async () => {
      const data: CreatePackageData = {
        type: 'review',
        assemblyLineId: 'line-1',
      };
      mockFetchResponse({ id: 'new-2', ...data });
      await packages.create(data);
      const { init } = lastFetchCall();
      expect(JSON.parse(init.body as string).assemblyLineId).toBe('line-1');
    });
  });
});

// ---------------------------------------------------------------------------
// workers namespace
// ---------------------------------------------------------------------------

describe('workers', () => {
  describe('list', () => {
    it('sends GET /workers', async () => {
      mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });
      await workers.list();
      const { url, init } = lastFetchCall();
      expect(url).toBe('http://localhost:3000/api/workers');
      expect(init.method).toBe('GET');
    });

    it('sends query params', async () => {
      mockFetchResponse({ data: [], total: 0, page: 1, limit: 5 });
      await workers.list({ limit: 5 });
      const { url } = lastFetchCall();
      expect(new URL(url).searchParams.get('limit')).toBe('5');
    });
  });

  describe('get', () => {
    it('sends GET /workers/:slug', async () => {
      const worker = { id: 'w-1', name: 'Reviewer', slug: 'reviewer' };
      mockFetchResponse(worker);
      const result = await workers.get('reviewer');
      const { url } = lastFetchCall();
      expect(url).toBe('http://localhost:3000/api/workers/reviewer');
      expect(result).toEqual(worker as any);
    });
  });
});

// ---------------------------------------------------------------------------
// assemblyLines namespace
// ---------------------------------------------------------------------------

describe('assemblyLines', () => {
  describe('list', () => {
    it('sends GET /assembly-lines', async () => {
      mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });
      await assemblyLines.list();
      const { url, init } = lastFetchCall();
      expect(url).toBe('http://localhost:3000/api/assembly-lines');
      expect(init.method).toBe('GET');
    });
  });

  describe('get', () => {
    it('sends GET /assembly-lines/:slug', async () => {
      const line = { id: 'al-1', name: 'Review Line', slug: 'review-line' };
      mockFetchResponse(line);
      const result = await assemblyLines.get('review-line');
      const { url } = lastFetchCall();
      expect(url).toBe(
        'http://localhost:3000/api/assembly-lines/review-line',
      );
      expect(result).toEqual(line as any);
    });
  });

  describe('submit', () => {
    it('sends POST /assembly-lines/:slug/packages', async () => {
      const data: SubmitPackageData = {
        type: 'review',
        metadata: { pr: '42' },
      };
      const pkg = { id: 'pkg-1', type: 'review', status: 'PENDING' };
      mockFetchResponse(pkg, 201);
      const result = await assemblyLines.submit('review-line', data);
      const { url, init } = lastFetchCall();
      expect(url).toBe(
        'http://localhost:3000/api/assembly-lines/review-line/packages',
      );
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(data);
      expect(result).toEqual(pkg as any);
    });

    it('encodes slug with special characters', async () => {
      mockFetchResponse({ id: 'pkg-2' });
      await assemblyLines.submit('my line/v2', { type: 'test' });
      const { url } = lastFetchCall();
      expect(url).toContain('my%20line%2Fv2');
    });
  });
});

// ---------------------------------------------------------------------------
// workerPools namespace
// ---------------------------------------------------------------------------

describe('workerPools', () => {
  describe('list', () => {
    it('sends GET /worker-pools', async () => {
      mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });
      await workerPools.list();
      const { url, init } = lastFetchCall();
      expect(url).toBe('http://localhost:3000/api/worker-pools');
      expect(init.method).toBe('GET');
    });

    it('supports pagination params', async () => {
      mockFetchResponse({ data: [], total: 0, page: 3, limit: 25 });
      await workerPools.list({ page: 3, limit: 25 });
      const { url } = lastFetchCall();
      const parsed = new URL(url);
      expect(parsed.searchParams.get('page')).toBe('3');
      expect(parsed.searchParams.get('limit')).toBe('25');
    });
  });

  describe('get', () => {
    it('sends GET /worker-pools/:slug', async () => {
      const pool = {
        id: 'wp-1',
        name: 'Pool A',
        slug: 'pool-a',
        maxConcurrency: 5,
      };
      mockFetchResponse(pool);
      const result = await workerPools.get('pool-a');
      const { url } = lastFetchCall();
      expect(url).toBe('http://localhost:3000/api/worker-pools/pool-a');
      expect(result).toEqual(pool as any);
    });
  });

  describe('submit', () => {
    it('sends POST /worker-pools/:slug/packages', async () => {
      const data: SubmitPackageData = { type: 'summarize' };
      const pkg = { id: 'pkg-3', type: 'summarize', status: 'PENDING' };
      mockFetchResponse(pkg, 201);
      const result = await workerPools.submit('pool-a', data);
      const { url, init } = lastFetchCall();
      expect(url).toBe(
        'http://localhost:3000/api/worker-pools/pool-a/packages',
      );
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(data);
      expect(result).toEqual(pkg as any);
    });
  });
});

// ---------------------------------------------------------------------------
// jobs namespace
// ---------------------------------------------------------------------------

describe('jobs', () => {
  describe('getLogs', () => {
    it('sends GET /jobs/:jobId/logs', async () => {
      const logsResponse = {
        data: [
          {
            id: 'log-1',
            jobId: 'job-1',
            level: 'info',
            message: 'Started',
            timestamp: '2026-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 100,
      };
      mockFetchResponse(logsResponse);
      const result = await jobs.getLogs('job-1');
      const { url, init } = lastFetchCall();
      expect(url).toBe('http://localhost:3000/api/jobs/job-1/logs');
      expect(init.method).toBe('GET');
      expect(result).toEqual(logsResponse);
    });

    it('sends log-specific query params', async () => {
      const params: JobLogsParams = {
        page: 2,
        limit: 50,
        level: 'error',
        after: '2026-01-01T00:00:00Z',
        before: '2026-12-31T23:59:59Z',
      };
      mockFetchResponse({ data: [], total: 0, page: 2, limit: 50 });
      await jobs.getLogs('job-2', params);
      const { url } = lastFetchCall();
      const parsed = new URL(url);
      expect(parsed.searchParams.get('page')).toBe('2');
      expect(parsed.searchParams.get('limit')).toBe('50');
      expect(parsed.searchParams.get('level')).toBe('error');
      expect(parsed.searchParams.get('after')).toBe('2026-01-01T00:00:00Z');
      expect(parsed.searchParams.get('before')).toBe(
        '2026-12-31T23:59:59Z',
      );
    });

    it('omits undefined log params', async () => {
      mockFetchResponse({ data: [], total: 0, page: 1, limit: 100 });
      await jobs.getLogs('job-3', { level: 'warn' });
      const { url } = lastFetchCall();
      const parsed = new URL(url);
      expect(parsed.searchParams.has('page')).toBe(false);
      expect(parsed.searchParams.has('limit')).toBe(false);
      expect(parsed.searchParams.get('level')).toBe('warn');
    });
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('throws CliApiError on non-2xx response with JSON body', async () => {
    mockFetchError(422, {
      message: 'Validation failed',
      details: { type: ['must not be empty'] },
    });
    try {
      await packages.list();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CliApiError);
      const apiErr = err as CliApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.message).toBe('Validation failed');
      expect(apiErr.details).toEqual({ type: ['must not be empty'] });
    }
  });

  it('throws CliApiError with statusText when body is not JSON', async () => {
    mockFetchError(500, undefined, 'Internal Server Error');
    try {
      await workers.list();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CliApiError);
      const apiErr = err as CliApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.message).toBe('Internal Server Error');
      expect(apiErr.details).toBeUndefined();
    }
  });

  it('throws CliApiError with fallback message when no statusText', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('err', { status: 503, statusText: '' }),
    );
    try {
      await packages.get('x');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CliApiError);
      const apiErr = err as CliApiError;
      expect(apiErr.status).toBe(503);
      expect(apiErr.message).toBe('HTTP 503');
    }
  });

  it('uses error body message over statusText', async () => {
    mockFetchError(404, { message: 'Package not found' }, 'Not Found');
    try {
      await packages.get('missing');
      expect.unreachable('should have thrown');
    } catch (err) {
      const apiErr = err as CliApiError;
      expect(apiErr.message).toBe('Package not found');
    }
  });
});

// ---------------------------------------------------------------------------
// 204 No Content handling
// ---------------------------------------------------------------------------

describe('204 No Content', () => {
  it('returns undefined without parsing JSON', async () => {
    mockFetch204();
    // Use the request function indirectly via a custom endpoint
    // Since our public API doesn't expose a DELETE, we test via the
    // internal mechanism — a successful 204 response shouldn't throw.
    // We'll test by making packages.get return 204 (unusual but tests the path)
    resetBaseUrl();
    const result = await packages.get('test-204');
    // The fetch was mocked to return 204, so result should be undefined
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Content-Type header
// ---------------------------------------------------------------------------

describe('Content-Type header', () => {
  it('sets Content-Type: application/json for POST requests with body', async () => {
    mockFetchResponse({ id: 'p-1' }, 201);
    await packages.create({ type: 'test' });
    const { init } = lastFetchCall();
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('does not set Content-Type for GET requests', async () => {
    mockFetchResponse({ data: [] });
    await packages.list();
    const { init } = lastFetchCall();
    expect(
      (init.headers as Record<string, string>)['Content-Type'],
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Base URL integration with requests
// ---------------------------------------------------------------------------

describe('base URL integration', () => {
  it('uses env var base URL in requests', async () => {
    process.env['SMITHY_API_URL'] = 'http://prod:4000/v2';
    mockFetchResponse({ data: [] });
    await workers.list();
    const { url } = lastFetchCall();
    expect(url).toBe('http://prod:4000/v2/workers');
  });

  it('uses config file base URL in requests', async () => {
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ apiUrl: 'http://staging:5000/api' }),
    );
    mockFetchResponse({ id: 'w-1' });
    await workers.get('test-worker');
    const { url } = lastFetchCall();
    expect(url).toBe('http://staging:5000/api/workers/test-worker');
  });
});

// ---------------------------------------------------------------------------
// Query parameter edge cases
// ---------------------------------------------------------------------------

describe('query parameter edge cases', () => {
  it('handles empty filter object', async () => {
    mockFetchResponse({ data: [], total: 0, page: 1, limit: 20 });
    await packages.list({ filter: {} });
    const { url } = lastFetchCall();
    // No filter params means no query string
    expect(url).toBe('http://localhost:3000/api/packages');
  });

  it('handles zero values for page and limit', async () => {
    mockFetchResponse({ data: [], total: 0, page: 0, limit: 0 });
    await packages.list({ page: 0, limit: 0 });
    const { url } = lastFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get('page')).toBe('0');
    expect(parsed.searchParams.get('limit')).toBe('0');
  });
});
