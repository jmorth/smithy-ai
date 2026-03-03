import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  packages,
  workers,
  assemblyLines,
  workerPools,
  notifications,
  webhooks,
  jobs,
} from './client';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

function noContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    statusText: 'No Content',
    json: () => Promise.reject(new Error('No body')),
    headers: new Headers(),
  } as unknown as Response;
}

function errorResponse(
  status: number,
  body: unknown,
  statusText = 'Error',
): Response {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

function nonJsonErrorResponse(status: number, statusText: string): Response {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.reject(new SyntaxError('Unexpected token')),
    headers: new Headers(),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lastFetchCall() {
  const calls = mockFetch.mock.calls;
  return calls[calls.length - 1]!;
}

function lastFetchUrl(): string {
  return lastFetchCall()[0] as string;
}

function lastFetchInit(): RequestInit {
  return lastFetchCall()[1] as RequestInit;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockFetch.mockReset();
});

// ===== request helper / ApiError ===========================================

describe('request helper', () => {
  it('throws ApiError with status and message on non-2xx responses', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(404, { message: 'Not found' }),
    );

    await expect(packages.get('abc')).rejects.toThrow(ApiError);
    await mockFetch.mockResolvedValueOnce(
      errorResponse(404, { message: 'Not found' }),
    );
    try {
      await packages.get('abc');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.message).toBe('Not found');
      expect(apiErr.details).toBeUndefined();
    }
  });

  it('throws ApiError with details for validation errors', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(400, {
        message: 'Validation failed',
        details: { name: ['must not be empty'] },
      }),
    );

    try {
      await packages.create({ type: '' });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.message).toBe('Validation failed');
      expect(apiErr.details).toEqual({ name: ['must not be empty'] });
    }
  });

  it('handles array message from backend', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(400, {
        message: ['field1 is required', 'field2 must be a string'],
      }),
    );

    try {
      await packages.create({ type: '' });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.message).toBe(
        'field1 is required; field2 must be a string',
      );
    }
  });

  it('falls back to statusText when error body is not JSON', async () => {
    mockFetch.mockResolvedValueOnce(
      nonJsonErrorResponse(502, 'Bad Gateway'),
    );

    try {
      await packages.get('abc');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(502);
      expect(apiErr.message).toBe('Bad Gateway');
    }
  });

  it('handles 204 No Content without parsing JSON', async () => {
    mockFetch.mockResolvedValueOnce(noContentResponse());

    const result = await packages.delete('some-id');
    expect(result).toBeUndefined();
  });

  it('sets Content-Type: application/json for request bodies', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', type: 'test', status: 'PENDING' }),
    );

    await packages.create({ type: 'test' });

    const init = lastFetchInit();
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ type: 'test' }));
  });

  it('does not set Content-Type when there is no body', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { limit: 20, total: 0 } }),
    );

    await packages.list();

    const init = lastFetchInit();
    expect(init.headers).toEqual({});
    expect(init.body).toBeUndefined();
  });

  it('passes AbortSignal through to fetch', async () => {
    const controller = new AbortController();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { limit: 20, total: 0 } }),
    );

    await packages.list(undefined, controller.signal);

    const init = lastFetchInit();
    expect(init.signal).toBe(controller.signal);
  });
});

// ===== URL building ========================================================

describe('buildUrl', () => {
  it('constructs URL with base path', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { limit: 20, total: 0 } }),
    );

    await packages.list();
    expect(lastFetchUrl()).toBe('/api/packages');
  });

  it('appends query params', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { limit: 10, total: 0 } }),
    );

    await packages.list({ limit: 10, type: 'USER_INPUT' });
    const url = lastFetchUrl();
    expect(url).toContain('limit=10');
    expect(url).toContain('type=USER_INPUT');
  });

  it('omits undefined/null params', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { limit: 20, total: 0 } }),
    );

    await packages.list({ limit: undefined, page: undefined });
    expect(lastFetchUrl()).toBe('/api/packages');
  });

  it('flattens nested filter objects', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    await assemblyLines.list({
      page: 1,
      filter: { status: 'ACTIVE' },
    });

    const url = lastFetchUrl();
    expect(url).toContain('page=1');
    expect(url).toContain('status=ACTIVE');
  });

  it('encodes URI components in path parameters', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: '1' }));

    await workers.get('my worker/slug');
    expect(lastFetchUrl()).toBe('/api/workers/my%20worker%2Fslug');
  });
});

// ===== Package endpoints ===================================================

describe('packages', () => {
  it('list() sends GET /packages', async () => {
    const response = { data: [], meta: { limit: 20, total: 0 } };
    mockFetch.mockResolvedValueOnce(jsonResponse(response));

    const result = await packages.list();
    expect(result).toEqual(response);
    expect(lastFetchInit().method).toBe('GET');
    expect(lastFetchUrl()).toBe('/api/packages');
  });

  it('list() passes pagination params', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { limit: 5, total: 0 } }),
    );

    await packages.list({ limit: 5, status: 'PENDING' as const });
    const url = lastFetchUrl();
    expect(url).toContain('limit=5');
    expect(url).toContain('status=PENDING');
  });

  it('get() sends GET /packages/:id', async () => {
    const pkg = { id: 'abc-123', type: 'USER_INPUT', status: 'PENDING' };
    mockFetch.mockResolvedValueOnce(jsonResponse(pkg));

    const result = await packages.get('abc-123');
    expect(result).toEqual(pkg);
    expect(lastFetchUrl()).toBe('/api/packages/abc-123');
  });

  it('create() sends POST /packages with body', async () => {
    const body = { type: 'USER_INPUT', metadata: { key: 'value' } };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', ...body, status: 'PENDING' }),
    );

    await packages.create(body);
    expect(lastFetchInit().method).toBe('POST');
    expect(lastFetchUrl()).toBe('/api/packages');
    expect(JSON.parse(lastFetchInit().body as string)).toEqual(body);
  });

  it('update() sends PATCH /packages/:id', async () => {
    const body = { status: 'COMPLETED' as const };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', type: 'USER_INPUT', status: 'COMPLETED' }),
    );

    await packages.update('1', body);
    expect(lastFetchInit().method).toBe('PATCH');
    expect(lastFetchUrl()).toBe('/api/packages/1');
  });

  it('delete() sends DELETE /packages/:id', async () => {
    mockFetch.mockResolvedValueOnce(noContentResponse());

    await packages.delete('1');
    expect(lastFetchInit().method).toBe('DELETE');
    expect(lastFetchUrl()).toBe('/api/packages/1');
  });
});

// ===== Worker endpoints ====================================================

describe('workers', () => {
  it('list() sends GET /workers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    const result = await workers.list();
    expect(result).toEqual([]);
    expect(lastFetchUrl()).toBe('/api/workers');
  });

  it('list() passes query params', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    await workers.list({ name: 'summarizer', status: 'ACTIVE' });
    const url = lastFetchUrl();
    expect(url).toContain('name=summarizer');
    expect(url).toContain('status=ACTIVE');
  });

  it('get() sends GET /workers/:slug', async () => {
    const worker = { id: '1', name: 'test', slug: 'test' };
    mockFetch.mockResolvedValueOnce(jsonResponse(worker));

    const result = await workers.get('test');
    expect(result).toEqual(worker);
    expect(lastFetchUrl()).toBe('/api/workers/test');
  });

  it('create() sends POST /workers', async () => {
    const body = { name: 'Test Worker', description: 'desc' };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', ...body, slug: 'test-worker' }),
    );

    await workers.create(body);
    expect(lastFetchInit().method).toBe('POST');
    expect(lastFetchUrl()).toBe('/api/workers');
    expect(JSON.parse(lastFetchInit().body as string)).toEqual(body);
  });

  it('createVersion() sends POST /workers/:slug/versions', async () => {
    const body = { yamlConfig: { name: 'test' } };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', version: '1.0.0' }),
    );

    await workers.createVersion('test-worker', body);
    expect(lastFetchInit().method).toBe('POST');
    expect(lastFetchUrl()).toBe('/api/workers/test-worker/versions');
  });
});

// ===== Assembly Line endpoints =============================================

describe('assemblyLines', () => {
  it('list() sends GET /assembly-lines', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    await assemblyLines.list();
    expect(lastFetchUrl()).toBe('/api/assembly-lines');
  });

  it('get() sends GET /assembly-lines/:slug', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', slug: 'my-line', steps: [] }),
    );

    await assemblyLines.get('my-line');
    expect(lastFetchUrl()).toBe('/api/assembly-lines/my-line');
  });

  it('create() sends POST /assembly-lines', async () => {
    const body = {
      name: 'My Line',
      steps: [{ workerVersionId: 'v1' }],
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', name: 'My Line', slug: 'my-line' }),
    );

    await assemblyLines.create(body);
    expect(lastFetchInit().method).toBe('POST');
    expect(lastFetchUrl()).toBe('/api/assembly-lines');
  });

  it('update() sends PATCH /assembly-lines/:slug', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', name: 'Updated' }),
    );

    await assemblyLines.update('my-line', { name: 'Updated' });
    expect(lastFetchInit().method).toBe('PATCH');
    expect(lastFetchUrl()).toBe('/api/assembly-lines/my-line');
  });

  it('delete() sends DELETE /assembly-lines/:slug', async () => {
    mockFetch.mockResolvedValueOnce(noContentResponse());

    await assemblyLines.delete('my-line');
    expect(lastFetchInit().method).toBe('DELETE');
    expect(lastFetchUrl()).toBe('/api/assembly-lines/my-line');
  });

  it('submitPackage() sends POST /assembly-lines/:slug/submit', async () => {
    const body = { type: 'USER_INPUT', metadata: {} };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', type: 'USER_INPUT' }),
    );

    await assemblyLines.submitPackage('my-line', body);
    expect(lastFetchInit().method).toBe('POST');
    expect(lastFetchUrl()).toBe('/api/assembly-lines/my-line/submit');
  });

  it('listPackages() sends GET /assembly-lines/:slug/packages', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { limit: 20, total: 0 } }),
    );

    await assemblyLines.listPackages('my-line', { limit: 10 });
    const url = lastFetchUrl();
    expect(url).toContain('/api/assembly-lines/my-line/packages');
    expect(url).toContain('limit=10');
  });
});

// ===== Worker Pool endpoints ===============================================

describe('workerPools', () => {
  it('list() sends GET /worker-pools', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    await workerPools.list();
    expect(lastFetchUrl()).toBe('/api/worker-pools');
  });

  it('get() sends GET /worker-pools/:slug', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', slug: 'pool-1', members: [] }),
    );

    await workerPools.get('pool-1');
    expect(lastFetchUrl()).toBe('/api/worker-pools/pool-1');
  });

  it('create() sends POST /worker-pools', async () => {
    const body = {
      name: 'Pool',
      members: [{ workerVersionId: 'v1' }],
      maxConcurrency: 5,
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', name: 'Pool', slug: 'pool' }),
    );

    await workerPools.create(body);
    expect(lastFetchInit().method).toBe('POST');
    expect(lastFetchUrl()).toBe('/api/worker-pools');
  });

  it('update() sends PATCH /worker-pools/:slug', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: '1', name: 'Updated' }));

    await workerPools.update('pool-1', { name: 'Updated' });
    expect(lastFetchInit().method).toBe('PATCH');
    expect(lastFetchUrl()).toBe('/api/worker-pools/pool-1');
  });

  it('delete() sends DELETE /worker-pools/:slug', async () => {
    mockFetch.mockResolvedValueOnce(noContentResponse());

    await workerPools.delete('pool-1');
    expect(lastFetchInit().method).toBe('DELETE');
    expect(lastFetchUrl()).toBe('/api/worker-pools/pool-1');
  });

  it('submitPackage() sends POST /worker-pools/:slug/submit', async () => {
    const body = { type: 'CODE' };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', type: 'CODE' }),
    );

    await workerPools.submitPackage('pool-1', body);
    expect(lastFetchInit().method).toBe('POST');
    expect(lastFetchUrl()).toBe('/api/worker-pools/pool-1/submit');
  });
});

// ===== Notification endpoints ==============================================

describe('notifications', () => {
  it('list() sends GET /notifications', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { page: 1, limit: 20, total: 0 } }),
    );

    await notifications.list();
    expect(lastFetchUrl()).toBe('/api/notifications');
  });

  it('list() passes query params', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { page: 1, limit: 10, total: 0 } }),
    );

    await notifications.list({ page: 2, limit: 10, status: 'READ' });
    const url = lastFetchUrl();
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
    expect(url).toContain('status=READ');
  });

  it('markRead() sends PATCH /notifications/:id/read', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 'n1', status: 'READ' }),
    );

    await notifications.markRead('n1');
    expect(lastFetchInit().method).toBe('PATCH');
    expect(lastFetchUrl()).toBe('/api/notifications/n1/read');
  });

  it('markAllRead() sends PATCH /notifications/read-all', async () => {
    mockFetch.mockResolvedValueOnce(noContentResponse());

    await notifications.markAllRead();
    expect(lastFetchInit().method).toBe('PATCH');
    expect(lastFetchUrl()).toBe('/api/notifications/read-all');
  });
});

// ===== Webhook endpoints ===================================================

describe('webhooks', () => {
  it('list() sends GET /webhook-endpoints', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    await webhooks.list();
    expect(lastFetchUrl()).toBe('/api/webhook-endpoints');
  });

  it('create() sends POST /webhook-endpoints', async () => {
    const body = {
      url: 'https://example.com/hook',
      secret: 's3cret',
      events: ['PACKAGE_CREATED'],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'w1', ...body }));

    await webhooks.create(body);
    expect(lastFetchInit().method).toBe('POST');
    expect(lastFetchUrl()).toBe('/api/webhook-endpoints');
  });

  it('update() sends PATCH /webhook-endpoints/:id', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 'w1', active: false }),
    );

    await webhooks.update('w1', { active: false });
    expect(lastFetchInit().method).toBe('PATCH');
    expect(lastFetchUrl()).toBe('/api/webhook-endpoints/w1');
  });

  it('delete() sends DELETE /webhook-endpoints/:id', async () => {
    mockFetch.mockResolvedValueOnce(noContentResponse());

    await webhooks.delete('w1');
    expect(lastFetchInit().method).toBe('DELETE');
    expect(lastFetchUrl()).toBe('/api/webhook-endpoints/w1');
  });
});

// ===== Job Log endpoints ===================================================

describe('jobs', () => {
  it('getLogs() sends GET /jobs/:jobId/logs', async () => {
    const response = {
      data: [],
      meta: { page: 1, limit: 100, total: 0, jobId: 'j1', jobState: 'RUNNING' },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(response));

    const result = await jobs.getLogs('j1');
    expect(result).toEqual(response);
    expect(lastFetchUrl()).toBe('/api/jobs/j1/logs');
  });

  it('getLogs() passes query params', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [],
        meta: { page: 1, limit: 50, total: 0, jobId: 'j1', jobState: 'RUNNING' },
      }),
    );

    await jobs.getLogs('j1', { level: 'error', limit: 50, page: 2 });
    const url = lastFetchUrl();
    expect(url).toContain('level=error');
    expect(url).toContain('limit=50');
    expect(url).toContain('page=2');
  });

  it('getLogs() passes date range params', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [],
        meta: { page: 1, limit: 100, total: 0, jobId: 'j1', jobState: 'COMPLETED' },
      }),
    );

    await jobs.getLogs('j1', {
      after: '2024-01-01T00:00:00Z',
      before: '2024-12-31T23:59:59Z',
    });
    const url = lastFetchUrl();
    expect(url).toContain('after=2024-01-01T00%3A00%3A00Z');
    expect(url).toContain('before=2024-12-31T23%3A59%3A59Z');
  });
});

// ===== ApiError class =====================================================

describe('ApiError', () => {
  it('extends Error with correct name', () => {
    const err = new ApiError(404, 'Not found');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.details).toBeUndefined();
  });

  it('includes details when provided', () => {
    const err = new ApiError(400, 'Validation failed', {
      name: ['is required'],
    });
    expect(err.details).toEqual({ name: ['is required'] });
  });
});
