import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConcurrencyLimiterService } from './concurrency-limiter.service';

// ─── Mock builders ──────────────────────────────────────────────────────────

function createMockRedis() {
  return {
    // ioredis .eval() runs Lua scripts on the Redis server (not JS eval)
    eval: vi.fn(),
    get: vi.fn(),
  };
}

function createMockConfigService(concurrencyLimit = 10) {
  return {
    get: vi.fn((key: string) => {
      const map: Record<string, unknown> = {
        'containers.concurrencyLimit': concurrencyLimit,
      };
      return map[key];
    }),
  };
}

function buildService(overrides?: {
  concurrencyLimit?: number;
  redis?: ReturnType<typeof createMockRedis>;
}) {
  const mockRedis = overrides?.redis ?? createMockRedis();
  const mockConfigService = createMockConfigService(overrides?.concurrencyLimit ?? 10);
  const service = new ConcurrencyLimiterService(
    mockRedis as any,
    mockConfigService as any,
  );
  return { service, mockRedis, mockConfigService };
}

/** Flush pending microtasks so non-awaited acquire() calls complete their async path. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ConcurrencyLimiterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('reads the concurrency limit from config', () => {
      const { mockConfigService } = buildService({ concurrencyLimit: 5 });
      expect(mockConfigService.get).toHaveBeenCalledWith('containers.concurrencyLimit');
    });
  });

  // ── acquire ─────────────────────────────────────────────────────────────

  describe('acquire', () => {
    it('returns true when a slot is available (counter below limit)', async () => {
      const { service, mockRedis } = buildService({ concurrencyLimit: 10 });
      mockRedis.eval.mockResolvedValue(1); // Lua returns new counter value

      const result = await service.acquire('job-001');

      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
      // Verify Lua script was called with correct key and args
      const callArgs = mockRedis.eval.mock.calls[0]!;
      expect(callArgs[1]).toBe(1); // numkeys
      expect(callArgs[2]).toBe('smithy:containers:active'); // KEYS[1]
      expect(callArgs[3]).toBe(10); // ARGV[1] = concurrency limit
      expect(callArgs[4]).toBe(3600); // ARGV[2] = TTL
    });

    it('returns true when counter reaches the limit exactly', async () => {
      const { service, mockRedis } = buildService({ concurrencyLimit: 3 });
      mockRedis.eval.mockResolvedValue(3); // Counter = limit

      const result = await service.acquire('job-001');
      expect(result).toBe(true);
    });

    it('enqueues job when Lua returns -1 (at capacity)', async () => {
      const { service, mockRedis } = buildService({ concurrencyLimit: 2 });
      mockRedis.eval.mockResolvedValue(-1);

      // acquire() returns a promise that won't resolve until release() is called
      const acquirePromise = service.acquire('job-blocked');
      await flush();

      // Verify job is in the waiting queue
      expect(service.getWaitingCount()).toBe(1);
      expect(service.getWaitingQueue()).toEqual(['job-blocked']);

      // Now simulate a release that dequeues this job
      mockRedis.eval
        .mockResolvedValueOnce(1) // release Lua script result
        .mockResolvedValueOnce(1); // dequeue acquire Lua script result

      await service.release();

      const result = await acquirePromise;
      expect(result).toBe(true);
      expect(service.getWaitingCount()).toBe(0);
    });

    it('returns true on Redis failure (fail-open behavior)', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.eval.mockRejectedValue(new Error('Connection refused'));

      const result = await service.acquire('job-failopen');

      expect(result).toBe(true);
    });

    it('does not increment the counter when at capacity', async () => {
      const { service, mockRedis } = buildService({ concurrencyLimit: 2 });
      mockRedis.eval.mockResolvedValue(-1);

      // Start acquiring (will block), don't await
      service.acquire('job-blocked');

      // The Lua script handles the atomic check — if it returns -1,
      // the counter was NOT incremented (that's what the Lua script does)
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    });

    it('passes correct concurrency limit from config to Lua script', async () => {
      const { service, mockRedis } = buildService({ concurrencyLimit: 25 });
      mockRedis.eval.mockResolvedValue(1);

      await service.acquire('job-001');

      const callArgs = mockRedis.eval.mock.calls[0]!;
      expect(callArgs[3]).toBe(25); // ARGV[1] = concurrency limit
    });
  });

  // ── release ─────────────────────────────────────────────────────────────

  describe('release', () => {
    it('calls Redis Lua script to decrement counter', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.eval.mockResolvedValue(4); // new count after decrement

      await service.release();

      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
      const callArgs = mockRedis.eval.mock.calls[0]!;
      expect(callArgs[1]).toBe(1); // numkeys
      expect(callArgs[2]).toBe('smithy:containers:active'); // KEYS[1]
      expect(callArgs[3]).toBe(3600); // ARGV[1] = TTL
    });

    it('never decrements below zero (Lua script guards this)', async () => {
      const { service, mockRedis } = buildService();
      // Lua script returns 0 when counter is already at 0
      mockRedis.eval.mockResolvedValue(0);

      await service.release();

      // The Lua script handles the guard — we just verify it's called
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    });

    it('dequeues the next waiting job after releasing', async () => {
      const { service, mockRedis } = buildService({ concurrencyLimit: 1 });

      // Fill to capacity first
      mockRedis.eval.mockResolvedValue(-1);
      const promise1 = service.acquire('job-waiting-1');
      const promise2 = service.acquire('job-waiting-2');
      await flush();

      expect(service.getWaitingCount()).toBe(2);
      expect(service.getWaitingQueue()).toEqual(['job-waiting-1', 'job-waiting-2']);

      // Release: decrement succeeds, then dequeue acquires for job-waiting-1
      mockRedis.eval
        .mockResolvedValueOnce(0) // release Lua
        .mockResolvedValueOnce(1); // dequeue acquire Lua for job-waiting-1

      await service.release();

      const result1 = await promise1;
      expect(result1).toBe(true);
      expect(service.getWaitingCount()).toBe(1);
      expect(service.getWaitingQueue()).toEqual(['job-waiting-2']);

      // Release again for job-waiting-2
      mockRedis.eval
        .mockResolvedValueOnce(0) // release Lua
        .mockResolvedValueOnce(1); // dequeue acquire Lua for job-waiting-2

      await service.release();

      const result2 = await promise2;
      expect(result2).toBe(true);
      expect(service.getWaitingCount()).toBe(0);
    });

    it('handles Redis failure gracefully during release', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.eval.mockRejectedValue(new Error('Redis down'));

      // Should not throw
      await expect(service.release()).resolves.toBeUndefined();
    });

    it('still attempts dequeue on Redis failure during release', async () => {
      const { service, mockRedis } = buildService({ concurrencyLimit: 1 });

      // Enqueue a waiting job
      mockRedis.eval.mockResolvedValueOnce(-1);
      const waitingPromise = service.acquire('job-waiting');
      await flush();
      expect(service.getWaitingCount()).toBe(1);

      // Release fails, but dequeue should still run (fail-open)
      mockRedis.eval
        .mockRejectedValueOnce(new Error('Redis down on release'))
        .mockRejectedValueOnce(new Error('Redis down on dequeue acquire'));

      await service.release();

      // The waiting job should resolve true (fail-open)
      const result = await waitingPromise;
      expect(result).toBe(true);
      expect(service.getWaitingCount()).toBe(0);
    });
  });

  // ── getActiveCount ──────────────────────────────────────────────────────

  describe('getActiveCount', () => {
    it('returns the current counter value from Redis', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue('7');

      const count = await service.getActiveCount();

      expect(count).toBe(7);
      expect(mockRedis.get).toHaveBeenCalledWith('smithy:containers:active');
    });

    it('returns 0 when Redis key does not exist', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue(null);

      const count = await service.getActiveCount();
      expect(count).toBe(0);
    });

    it('returns null on Redis failure', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockRejectedValue(new Error('Connection refused'));

      const count = await service.getActiveCount();
      expect(count).toBeNull();
    });
  });

  // ── forceRelease ────────────────────────────────────────────────────────

  describe('forceRelease', () => {
    it('calls release() to decrement and dequeue', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.eval.mockResolvedValue(3);

      await service.forceRelease('stuck-job-001');

      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    });
  });

  // ── getWaitingQueue / getWaitingCount ──────────────────────────────────

  describe('getWaitingQueue', () => {
    it('returns empty array when no jobs are waiting', () => {
      const { service } = buildService();
      expect(service.getWaitingQueue()).toEqual([]);
      expect(service.getWaitingCount()).toBe(0);
    });

    it('returns job IDs in FIFO order', async () => {
      const { service, mockRedis } = buildService({ concurrencyLimit: 1 });
      mockRedis.eval.mockResolvedValue(-1);

      service.acquire('first');
      service.acquire('second');
      service.acquire('third');
      await flush();

      expect(service.getWaitingQueue()).toEqual(['first', 'second', 'third']);
      expect(service.getWaitingCount()).toBe(3);
    });
  });

  // ── FIFO ordering ─────────────────────────────────────────────────────

  describe('FIFO dequeue ordering', () => {
    it('dequeues jobs in the order they were enqueued', async () => {
      const { service, mockRedis } = buildService({ concurrencyLimit: 1 });
      const resolved: string[] = [];

      mockRedis.eval.mockResolvedValue(-1);

      const p1 = service.acquire('job-A').then(() => resolved.push('job-A'));
      const p2 = service.acquire('job-B').then(() => resolved.push('job-B'));
      const p3 = service.acquire('job-C').then(() => resolved.push('job-C'));
      await flush();

      expect(service.getWaitingQueue()).toEqual(['job-A', 'job-B', 'job-C']);

      // Release one at a time
      mockRedis.eval
        .mockResolvedValueOnce(0)  // release Lua
        .mockResolvedValueOnce(1); // dequeue acquire Lua
      await service.release();
      await p1;

      mockRedis.eval
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);
      await service.release();
      await p2;

      mockRedis.eval
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);
      await service.release();
      await p3;

      expect(resolved).toEqual(['job-A', 'job-B', 'job-C']);
    });
  });

  // ── dequeue re-enqueue on slot contention ─────────────────────────────

  describe('dequeue contention', () => {
    it('re-enqueues job at front when dequeue acquire returns -1', async () => {
      const { service, mockRedis } = buildService({ concurrencyLimit: 1 });

      mockRedis.eval.mockResolvedValue(-1);
      service.acquire('job-contended');
      await flush();
      expect(service.getWaitingCount()).toBe(1);

      // Release succeeds, but dequeue acquire fails (another server took the slot)
      mockRedis.eval
        .mockResolvedValueOnce(0)   // release Lua
        .mockResolvedValueOnce(-1); // dequeue acquire Lua — contention

      await service.release();

      // Job should still be in the queue (re-enqueued at front)
      expect(service.getWaitingCount()).toBe(1);
      expect(service.getWaitingQueue()).toEqual(['job-contended']);
    });
  });

  // ── configurable limit ────────────────────────────────────────────────

  describe('configurable concurrency limit', () => {
    it('uses the configured limit from CONTAINER_CONCURRENCY_LIMIT', async () => {
      const { service, mockRedis } = buildService({ concurrencyLimit: 3 });
      mockRedis.eval.mockResolvedValue(1);

      await service.acquire('job-001');

      const callArgs = mockRedis.eval.mock.calls[0]!;
      expect(callArgs[3]).toBe(3);
    });

    it('defaults to 10 when using default config', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.eval.mockResolvedValue(1);

      await service.acquire('job-001');

      const callArgs = mockRedis.eval.mock.calls[0]!;
      expect(callArgs[3]).toBe(10);
    });
  });

  // ── injectable ────────────────────────────────────────────────────────

  describe('NestJS DI compatibility', () => {
    it('is constructable with injected dependencies', () => {
      const { service } = buildService();
      expect(service).toBeInstanceOf(ConcurrencyLimiterService);
    });
  });

  // ── Redis key ─────────────────────────────────────────────────────────

  describe('Redis key', () => {
    it('uses smithy:containers:active as the Redis key', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue('5');

      await service.getActiveCount();

      expect(mockRedis.get).toHaveBeenCalledWith('smithy:containers:active');
    });
  });

  // ── TTL safety net ────────────────────────────────────────────────────

  describe('TTL safety net', () => {
    it('passes TTL of 3600 seconds to acquire Lua script', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.eval.mockResolvedValue(1);

      await service.acquire('job-001');

      const callArgs = mockRedis.eval.mock.calls[0]!;
      expect(callArgs[4]).toBe(3600);
    });

    it('passes TTL of 3600 seconds to release Lua script', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.eval.mockResolvedValue(0);

      await service.release();

      const callArgs = mockRedis.eval.mock.calls[0]!;
      expect(callArgs[3]).toBe(3600);
    });
  });
});
