import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { WebhookService } from './webhook.service';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function createMockDb() {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  const deleteChain = {
    where: vi.fn().mockResolvedValue(undefined),
  };

  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    delete: vi.fn().mockReturnValue(deleteChain),
    _selectChain: selectChain,
    _insertChain: insertChain,
    _updateChain: updateChain,
    _deleteChain: deleteChain,
  };
}

const baseEndpoint = {
  id: 'ep-1',
  url: 'https://example.com/webhook',
  secret: 'test-secret-key',
  events: ['package.created', 'job.completed'],
  ownerId: 'user-123',
  active: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  lastDeliveryAt: null,
  lastDeliveryStatus: null,
};

const testEvent = {
  event: 'package.created',
  payload: { packageId: 'pkg-1', name: 'test-package' },
};

function buildService(db = createMockDb()) {
  const service = new WebhookService(db as any);
  // Override sleep to be instant in tests
  vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
  return { service, db };
}

function mockFetchResponse(
  status: number,
  opts?: { statusText?: string; headers?: Record<string, string> },
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: opts?.statusText ?? (status < 300 ? 'OK' : 'Error'),
    headers: {
      get: (name: string) => opts?.headers?.[name.toLowerCase()] ?? null,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebhookService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('injectable', () => {
    it('is an injectable NestJS service', () => {
      const { service } = buildService();
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(WebhookService);
    });
  });

  describe('deliverWebhook', () => {
    it('sends HTTP POST to the endpoint URL', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://example.com/webhook');
      expect(opts.method).toBe('POST');
    });

    it('sends JSON body with event, timestamp, and payload', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.event).toBe('package.created');
      expect(body.payload).toEqual({ packageId: 'pkg-1', name: 'test-package' });
      expect(body.timestamp).toBeDefined();
      // Verify timestamp is a valid ISO date
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it('includes X-Smithy-Signature header with HMAC-SHA256', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      const opts = fetchMock.mock.calls[0][1];
      const bodyString = opts.body;
      const expectedSignature = createHmac('sha256', 'test-secret-key')
        .update(bodyString)
        .digest('hex');
      expect(opts.headers['X-Smithy-Signature']).toBe(`sha256=${expectedSignature}`);
    });

    it('includes X-Smithy-Event header with the event type', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      const opts = fetchMock.mock.calls[0][1];
      expect(opts.headers['X-Smithy-Event']).toBe('package.created');
    });

    it('includes Content-Type: application/json header', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      const opts = fetchMock.mock.calls[0][1];
      expect(opts.headers['Content-Type']).toBe('application/json');
    });

    it('updates delivery status on success', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall.lastDeliveryStatus).toBe('200');
      expect(setCall.lastDeliveryAt).toBeInstanceOf(Date);
      expect(setCall.updatedAt).toBeInstanceOf(Date);
    });

    it('skips delivery when endpoint not found', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([]);

      const { service } = buildService(db);
      await service.deliverWebhook('ep-nonexistent', testEvent);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips delivery when endpoint is inactive', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([
        { ...baseEndpoint, active: false },
      ]);

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips delivery when event is not in subscribed list', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', {
        event: 'unsubscribed.event',
        payload: {},
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('retries on HTTP 500+ with exponential backoff', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockResolvedValueOnce(mockFetchResponse(500, { statusText: 'Internal Server Error' }))
        .mockResolvedValueOnce(mockFetchResponse(502, { statusText: 'Bad Gateway' }))
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      // First retry: delay = 1000 * 5^1 = 5000ms
      expect(sleepSpy).toHaveBeenCalledWith(5000);
      // Second retry: delay = 1000 * 5^2 = 25000ms
      expect(sleepSpy).toHaveBeenCalledWith(25000);
    });

    it('retries exactly 3 times then marks FAILED', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockResolvedValueOnce(mockFetchResponse(500, { statusText: 'Server Error' }))
        .mockResolvedValueOnce(mockFetchResponse(500, { statusText: 'Server Error' }))
        .mockResolvedValueOnce(mockFetchResponse(500, { statusText: 'Server Error' }));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall.lastDeliveryStatus).toBe('FAILED');
    });

    it('does not retry HTTP 4xx (except 429)', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(400, { statusText: 'Bad Request' }),
      );

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall.lastDeliveryStatus).toBe('400');
    });

    it('does not retry HTTP 403', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(403, { statusText: 'Forbidden' }),
      );

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('does not retry HTTP 404', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(404, { statusText: 'Not Found' }),
      );

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('retries HTTP 429 (Too Many Requests)', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockResolvedValueOnce(
          mockFetchResponse(429, { statusText: 'Too Many Requests' }),
        )
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('respects Retry-After header on 429 (seconds)', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockResolvedValueOnce(
          mockFetchResponse(429, {
            statusText: 'Too Many Requests',
            headers: { 'retry-after': '30' },
          }),
        )
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await service.deliverWebhook('ep-1', testEvent);

      // Should use Retry-After value of 30 seconds = 30000ms
      expect(sleepSpy).toHaveBeenCalledWith(30000);
    });

    it('respects Retry-After header on 429 (HTTP-date)', async () => {
      const futureDate = new Date(Date.now() + 15_000);
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockResolvedValueOnce(
          mockFetchResponse(429, {
            statusText: 'Too Many Requests',
            headers: { 'retry-after': futureDate.toUTCString() },
          }),
        )
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await service.deliverWebhook('ep-1', testEvent);

      // Should be approximately 15000ms (allow some tolerance)
      const sleepMs = sleepSpy.mock.calls[0][0];
      expect(sleepMs).toBeGreaterThanOrEqual(14000);
      expect(sleepMs).toBeLessThanOrEqual(16000);
    });

    it('falls back to exponential backoff on 429 without Retry-After', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockResolvedValueOnce(
          mockFetchResponse(429, { statusText: 'Too Many Requests' }),
        )
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await service.deliverWebhook('ep-1', testEvent);

      // Should use exponential backoff: 1000 * 5^1 = 5000ms
      expect(sleepSpy).toHaveBeenCalledWith(5000);
    });

    it('retries on network errors', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries on timeout (AbortError)', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchMock
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('marks FAILED after all retries exhausted on network errors', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall.lastDeliveryStatus).toBe('FAILED');
    });

    it('handles non-Error thrown from fetch', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockRejectedValueOnce('string error')
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('sets request timeout via AbortController signal', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      const opts = fetchMock.mock.calls[0][1];
      expect(opts.signal).toBeDefined();
      expect(opts.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('registerEndpoint', () => {
    it('inserts endpoint into webhook_endpoints table', async () => {
      const db = createMockDb();
      db._insertChain.returning.mockResolvedValueOnce([{
        ...baseEndpoint,
        id: 'ep-new',
      }]);

      const { service } = buildService(db);
      const result = await service.registerEndpoint(
        'https://example.com/webhook',
        'my-secret',
        ['package.created', 'job.completed'],
        'user-123',
      );

      expect(db.insert).toHaveBeenCalledOnce();
      const valuesCall = db._insertChain.values.mock.calls[0][0];
      expect(valuesCall.url).toBe('https://example.com/webhook');
      expect(valuesCall.secret).toBe('my-secret');
      expect(valuesCall.events).toEqual(['package.created', 'job.completed']);
      expect(valuesCall.ownerId).toBe('user-123');
      expect(result.id).toBe('ep-new');
    });

    it('returns the created endpoint record', async () => {
      const db = createMockDb();
      const created = { ...baseEndpoint, id: 'ep-new' };
      db._insertChain.returning.mockResolvedValueOnce([created]);

      const { service } = buildService(db);
      const result = await service.registerEndpoint(
        'https://example.com/webhook',
        'my-secret',
        ['package.created'],
        'user-123',
      );

      expect(result).toEqual(created);
    });
  });

  describe('listEndpoints', () => {
    it('returns all endpoints for a given ownerId', async () => {
      const db = createMockDb();
      const endpoints = [baseEndpoint, { ...baseEndpoint, id: 'ep-2' }];
      db._selectChain.where.mockResolvedValueOnce(endpoints);

      const { service } = buildService(db);
      const result = await service.listEndpoints('user-123');

      expect(db.select).toHaveBeenCalledOnce();
      expect(result).toEqual(endpoints);
    });

    it('returns empty array when no endpoints exist', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([]);

      const { service } = buildService(db);
      const result = await service.listEndpoints('user-no-endpoints');

      expect(result).toEqual([]);
    });
  });

  describe('deleteEndpoint', () => {
    it('deletes endpoint from webhook_endpoints table', async () => {
      const db = createMockDb();
      const { service } = buildService(db);

      await service.deleteEndpoint('ep-1');

      expect(db.delete).toHaveBeenCalledOnce();
      expect(db._deleteChain.where).toHaveBeenCalledOnce();
    });
  });

  describe('sleep', () => {
    it('resolves after the specified delay', async () => {
      const db = createMockDb();
      const service = new WebhookService(db as any);
      const start = Date.now();
      await (service as any).sleep(10);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(5);
    });
  });

  describe('HMAC-SHA256 signature verification', () => {
    it('generates correct HMAC-SHA256 signature for request body', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      await service.deliverWebhook('ep-1', testEvent);

      const opts = fetchMock.mock.calls[0][1];
      const bodyString = opts.body;
      const signatureHeader = opts.headers['X-Smithy-Signature'];

      // Verify the signature matches what we'd compute independently
      const expectedHash = createHmac('sha256', baseEndpoint.secret)
        .update(bodyString)
        .digest('hex');
      expect(signatureHeader).toBe(`sha256=${expectedHash}`);

      // Verify it starts with sha256=
      expect(signatureHeader).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('uses endpoint-specific secret for each delivery', async () => {
      const db1 = createMockDb();
      const endpoint1 = { ...baseEndpoint, id: 'ep-1', secret: 'secret-1' };
      db1._selectChain.where.mockResolvedValueOnce([endpoint1]);
      fetchMock.mockResolvedValueOnce(mockFetchResponse(200));

      const { service: service1 } = buildService(db1);
      await service1.deliverWebhook('ep-1', testEvent);
      const sig1 = fetchMock.mock.calls[0][1].headers['X-Smithy-Signature'];

      fetchMock.mockClear();

      const db2 = createMockDb();
      const endpoint2 = { ...baseEndpoint, id: 'ep-2', secret: 'secret-2' };
      db2._selectChain.where.mockResolvedValueOnce([endpoint2]);
      fetchMock.mockResolvedValueOnce(mockFetchResponse(200));

      const { service: service2 } = buildService(db2);
      await service2.deliverWebhook('ep-2', testEvent);
      const sig2 = fetchMock.mock.calls[0][1].headers['X-Smithy-Signature'];

      // Different secrets should produce different signatures
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('exponential backoff timing', () => {
    it('uses delay pattern: 5s, 25s for retries', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockResolvedValueOnce(mockFetchResponse(503, { statusText: 'Service Unavailable' }))
        .mockResolvedValueOnce(mockFetchResponse(503, { statusText: 'Service Unavailable' }))
        .mockResolvedValueOnce(mockFetchResponse(503, { statusText: 'Service Unavailable' }));

      const { service } = buildService(db);
      const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await service.deliverWebhook('ep-1', testEvent);

      // attempt 1 (index 1): 1000 * 5^1 = 5000
      expect(sleepSpy.mock.calls[0][0]).toBe(5000);
      // attempt 2 (index 2): 1000 * 5^2 = 25000
      expect(sleepSpy.mock.calls[1][0]).toBe(25000);
    });

    it('does not sleep before first attempt', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock.mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await service.deliverWebhook('ep-1', testEvent);

      expect(sleepSpy).not.toHaveBeenCalled();
    });
  });

  describe('parseRetryAfter (tested via behavior)', () => {
    it('ignores invalid Retry-After header', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockResolvedValueOnce(
          mockFetchResponse(429, {
            statusText: 'Too Many Requests',
            headers: { 'retry-after': 'invalid-value' },
          }),
        )
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await service.deliverWebhook('ep-1', testEvent);

      // Falls back to exponential: 1000 * 5^1 = 5000
      expect(sleepSpy).toHaveBeenCalledWith(5000);
    });

    it('ignores Retry-After with zero value', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockResolvedValueOnce(
          mockFetchResponse(429, {
            statusText: 'Too Many Requests',
            headers: { 'retry-after': '0' },
          }),
        )
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await service.deliverWebhook('ep-1', testEvent);

      // Falls back to exponential: 1000 * 5^1 = 5000
      expect(sleepSpy).toHaveBeenCalledWith(5000);
    });

    it('ignores Retry-After with past HTTP-date', async () => {
      const pastDate = new Date(Date.now() - 60_000);
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockResolvedValueOnce(
          mockFetchResponse(429, {
            statusText: 'Too Many Requests',
            headers: { 'retry-after': pastDate.toUTCString() },
          }),
        )
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await service.deliverWebhook('ep-1', testEvent);

      // Falls back to exponential: 1000 * 5^1 = 5000
      expect(sleepSpy).toHaveBeenCalledWith(5000);
    });

    it('ignores negative Retry-After value', async () => {
      const db = createMockDb();
      db._selectChain.where.mockResolvedValueOnce([baseEndpoint]);
      fetchMock
        .mockResolvedValueOnce(
          mockFetchResponse(429, {
            statusText: 'Too Many Requests',
            headers: { 'retry-after': '-5' },
          }),
        )
        .mockResolvedValueOnce(mockFetchResponse(200));

      const { service } = buildService(db);
      const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await service.deliverWebhook('ep-1', testEvent);

      // Falls back to exponential: 1000 * 5^1 = 5000
      expect(sleepSpy).toHaveBeenCalledWith(5000);
    });
  });
});
