import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PoolRouterService, getWorkerQueueName } from './pool-router.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePool(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pool-uuid-1',
    maxConcurrency: 5,
    ...overrides,
  };
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    workerVersionId: 'wv-uuid-1',
    priority: 1,
    workerSlug: 'my-worker',
    workerVersion: 1,
    status: 'ACTIVE',
    ...overrides,
  };
}

// ─── Mock chain helpers ───────────────────────────────────────────────────────

function makeSelectChain(resolveValue: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolveValue),
  };
}

function makeSelectChainWhereTerminal(resolveValue: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(resolveValue),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolveValue),
  };
}

// ─── Service builder ──────────────────────────────────────────────────────────

function buildService() {
  const mockDb: any = {
    select: vi.fn(),
  };

  const mockRedis: any = {
    incr: vi.fn(),
    get: vi.fn(),
    decr: vi.fn(),
  };

  const mockChannel: any = {
    sendToQueue: vi.fn(),
  };

  const service = new PoolRouterService(mockDb, mockRedis, mockChannel);
  return { service, mockDb, mockRedis, mockChannel };
}

/**
 * Configures mockDb.select to return pool on first call and members on second.
 */
function setupRoute(
  mockDb: any,
  pool: unknown,
  members: unknown[],
) {
  mockDb.select
    .mockReturnValueOnce(makeSelectChain(pool ? [pool] : []))
    .mockReturnValueOnce(makeSelectChainWhereTerminal(members));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getWorkerQueueName', () => {
  it('returns the expected queue name pattern', () => {
    expect(getWorkerQueueName('my-worker', 2)).toBe('worker.my-worker.v2');
  });

  it('handles version 1 correctly', () => {
    expect(getWorkerQueueName('summarizer', 1)).toBe('worker.summarizer.v1');
  });
});

describe('PoolRouterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── route ─────────────────────────────────────────────────────────────────

  describe('route', () => {
    it('throws NotFoundException when pool does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.route('nonexistent', 'pkg-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with poolSlug in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.route('missing-pool', 'pkg-1')).rejects.toThrow('missing-pool');
    });

    it('throws BadRequestException when pool has no members', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool(), []);
      mockRedis.incr.mockResolvedValue(1);

      await expect(service.route('my-pool', 'pkg-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when all members are deprecated', async () => {
      const { service, mockDb, mockRedis } = buildService();
      const deprecated = makeMember({ status: 'DEPRECATED' });
      setupRoute(mockDb, makePool(), [deprecated]);
      mockRedis.incr.mockResolvedValue(1);

      await expect(service.route('my-pool', 'pkg-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException with poolSlug when no eligible members', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool(), [makeMember({ status: 'DEPRECATED' })]);
      mockRedis.incr.mockResolvedValue(1);

      await expect(service.route('my-pool', 'pkg-1')).rejects.toThrow('my-pool');
    });

    it('returns dispatched status when pool is under capacity', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool({ maxConcurrency: 5 }), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('2'); // 2 active, max 5

      const result = await service.route('my-pool', 'pkg-1');
      expect(result.status).toBe('dispatched');
    });

    it('returns queued status when pool is at capacity', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool({ maxConcurrency: 3 }), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('3'); // 3 active, max 3

      const result = await service.route('my-pool', 'pkg-1');
      expect(result.status).toBe('queued');
    });

    it('returns queued status when pool active count exceeds capacity', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool({ maxConcurrency: 2 }), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('5'); // 5 active, max 2

      const result = await service.route('my-pool', 'pkg-1');
      expect(result.status).toBe('queued');
    });

    it('returns workerSlug in the result', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool(), [makeMember({ workerSlug: 'image-processor' })]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      const result = await service.route('my-pool', 'pkg-1');
      expect(result.workerSlug).toBe('image-processor');
    });

    it('returns workerVersion in the result', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool(), [makeMember({ workerVersion: 3 })]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      const result = await service.route('my-pool', 'pkg-1');
      expect(result.workerVersion).toBe(3);
    });

    it('increments the round-robin counter using Redis INCR', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool(), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      await service.route('my-pool', 'pkg-1');
      expect(mockRedis.incr).toHaveBeenCalledWith('pool:my-pool:rr');
    });

    it('reads active counter with correct Redis key', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool(), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      await service.route('my-pool', 'pkg-1');
      expect(mockRedis.get).toHaveBeenCalledWith('pool:my-pool:active');
    });

    it('increments active counter via Redis INCR on dispatch', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool(), [makeMember()]);
      mockRedis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(1); // rr + active
      mockRedis.get.mockResolvedValue('0');

      await service.route('my-pool', 'pkg-1');
      expect(mockRedis.incr).toHaveBeenCalledWith('pool:my-pool:active');
    });

    it('does not increment active counter when at capacity', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool({ maxConcurrency: 3 }), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1); // rr increment only
      mockRedis.get.mockResolvedValue('3'); // at capacity

      await service.route('my-pool', 'pkg-1');
      // incr is called once (rr), but NOT for active counter
      expect(mockRedis.incr).toHaveBeenCalledTimes(1);
      expect(mockRedis.incr).toHaveBeenCalledWith('pool:my-pool:rr');
    });

    it('publishes job message to the correct worker queue', async () => {
      const { service, mockDb, mockRedis, mockChannel } = buildService();
      setupRoute(mockDb, makePool(), [makeMember({ workerSlug: 'my-worker', workerVersion: 2 })]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      await service.route('my-pool', 'pkg-1');
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'worker.my-worker.v2',
        expect.any(Buffer),
        expect.objectContaining({ persistent: true }),
      );
    });

    it('does not publish to queue when at capacity', async () => {
      const { service, mockDb, mockRedis, mockChannel } = buildService();
      setupRoute(mockDb, makePool({ maxConcurrency: 2 }), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('2');

      await service.route('my-pool', 'pkg-1');
      expect(mockChannel.sendToQueue).not.toHaveBeenCalled();
    });

    it('includes packageId in the published message', async () => {
      const { service, mockDb, mockRedis, mockChannel } = buildService();
      setupRoute(mockDb, makePool(), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      await service.route('my-pool', 'pkg-abc-123');
      const buffer: Buffer = mockChannel.sendToQueue.mock.calls[0][1] as Buffer;
      const payload = JSON.parse(buffer.toString()) as Record<string, unknown>;
      expect(payload['packageId']).toBe('pkg-abc-123');
    });

    it('includes workerVersionId in the published message', async () => {
      const { service, mockDb, mockRedis, mockChannel } = buildService();
      setupRoute(mockDb, makePool(), [makeMember({ workerVersionId: 'wv-uuid-42' })]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      await service.route('my-pool', 'pkg-1');
      const buffer: Buffer = mockChannel.sendToQueue.mock.calls[0][1] as Buffer;
      const payload = JSON.parse(buffer.toString()) as Record<string, unknown>;
      expect(payload['workerVersionId']).toBe('wv-uuid-42');
    });

    it('includes poolSlug in the published message', async () => {
      const { service, mockDb, mockRedis, mockChannel } = buildService();
      setupRoute(mockDb, makePool(), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      await service.route('dispatch-pool', 'pkg-1');
      const buffer: Buffer = mockChannel.sendToQueue.mock.calls[0][1] as Buffer;
      const payload = JSON.parse(buffer.toString()) as Record<string, unknown>;
      expect(payload['poolSlug']).toBe('dispatch-pool');
    });

    it('includes a timestamp in the published message', async () => {
      const { service, mockDb, mockRedis, mockChannel } = buildService();
      setupRoute(mockDb, makePool(), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      await service.route('my-pool', 'pkg-1');
      const buffer: Buffer = mockChannel.sendToQueue.mock.calls[0][1] as Buffer;
      const payload = JSON.parse(buffer.toString()) as Record<string, unknown>;
      expect(typeof payload['timestamp']).toBe('string');
      expect(Date.parse(payload['timestamp'] as string)).not.toBeNaN();
    });

    it('publishes message with persistent flag', async () => {
      const { service, mockDb, mockRedis, mockChannel } = buildService();
      setupRoute(mockDb, makePool(), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      await service.route('my-pool', 'pkg-1');
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        expect.objectContaining({ persistent: true }),
      );
    });

    it('treats null active counter as 0', async () => {
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool({ maxConcurrency: 5 }), [makeMember()]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue(null); // no active key in Redis

      const result = await service.route('my-pool', 'pkg-1');
      expect(result.status).toBe('dispatched');
    });

    // ── Round-robin selection ────────────────────────────────────────────────

    it('selects member based on counter modulo member count', async () => {
      const memberA = makeMember({ workerSlug: 'worker-a', workerVersionId: 'wv-a' });
      const memberB = makeMember({ workerSlug: 'worker-b', workerVersionId: 'wv-b' });
      const memberC = makeMember({ workerSlug: 'worker-c', workerVersionId: 'wv-c' });
      const { service, mockDb, mockRedis } = buildService();
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([makePool()]))
        .mockReturnValueOnce(makeSelectChainWhereTerminal([memberA, memberB, memberC]));
      mockRedis.incr.mockResolvedValue(3); // counter=3, 3 % 3 = index 0 → worker-a
      mockRedis.get.mockResolvedValue('0');

      const result = await service.route('my-pool', 'pkg-1');
      expect(result.workerSlug).toBe('worker-a');
    });

    it('cycles through members with consecutive calls (simulated via counter)', async () => {
      const memberA = makeMember({ workerSlug: 'worker-a', workerVersionId: 'wv-a' });
      const memberB = makeMember({ workerSlug: 'worker-b', workerVersionId: 'wv-b' });
      const { service: s1, mockDb: db1, mockRedis: r1 } = buildService();
      db1.select
        .mockReturnValueOnce(makeSelectChain([makePool()]))
        .mockReturnValueOnce(makeSelectChainWhereTerminal([memberA, memberB]));
      r1.incr.mockResolvedValue(1); // 1 % 2 = 1 → worker-b
      r1.get.mockResolvedValue('0');
      const first = await s1.route('my-pool', 'pkg-1');

      const { service: s2, mockDb: db2, mockRedis: r2 } = buildService();
      db2.select
        .mockReturnValueOnce(makeSelectChain([makePool()]))
        .mockReturnValueOnce(makeSelectChainWhereTerminal([memberA, memberB]));
      r2.incr.mockResolvedValue(2); // 2 % 2 = 0 → worker-a
      r2.get.mockResolvedValue('0');
      const second = await s2.route('my-pool', 'pkg-2');

      expect(first.workerSlug).toBe('worker-b');
      expect(second.workerSlug).toBe('worker-a');
    });

    it('skips deprecated members in selection', async () => {
      const active = makeMember({ workerSlug: 'active-worker', status: 'ACTIVE' });
      const deprecated = makeMember({ workerSlug: 'old-worker', status: 'DEPRECATED' });
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool(), [active, deprecated]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      const result = await service.route('my-pool', 'pkg-1');
      // Only 1 eligible member so it must be selected
      expect(result.workerSlug).toBe('active-worker');
    });

    it('distributes evenly: 6 submissions to a 3-member pool give each member exactly 2 jobs', async () => {
      const memberA = makeMember({ workerSlug: 'worker-a', workerVersionId: 'wv-a' });
      const memberB = makeMember({ workerSlug: 'worker-b', workerVersionId: 'wv-b' });
      const memberC = makeMember({ workerSlug: 'worker-c', workerVersionId: 'wv-c' });
      const { service, mockDb, mockRedis } = buildService();

      for (let i = 0; i < 6; i++) {
        mockDb.select
          .mockReturnValueOnce(makeSelectChain([makePool()]))
          .mockReturnValueOnce(makeSelectChainWhereTerminal([memberA, memberB, memberC]));
      }
      // counters 1–6: 1%3=1→B, 2%3=2→C, 3%3=0→A, 4%3=1→B, 5%3=2→C, 6%3=0→A
      // Each dispatched route calls incr twice: once for rr, once for active.
      mockRedis.incr
        .mockResolvedValueOnce(1).mockResolvedValueOnce(1)   // rr=1, active
        .mockResolvedValueOnce(2).mockResolvedValueOnce(1)   // rr=2, active
        .mockResolvedValueOnce(3).mockResolvedValueOnce(1)   // rr=3, active
        .mockResolvedValueOnce(4).mockResolvedValueOnce(1)   // rr=4, active
        .mockResolvedValueOnce(5).mockResolvedValueOnce(1)   // rr=5, active
        .mockResolvedValueOnce(6).mockResolvedValueOnce(1);  // rr=6, active
      mockRedis.get.mockResolvedValue('0');

      const counts = new Map<string, number>();
      for (let i = 0; i < 6; i++) {
        const result = await service.route('my-pool', `package-${i}`);
        counts.set(result.workerSlug, (counts.get(result.workerSlug) ?? 0) + 1);
      }

      expect(counts.get('worker-a')).toBe(2);
      expect(counts.get('worker-b')).toBe(2);
      expect(counts.get('worker-c')).toBe(2);
    });

    it('counter wraps around after cycling through all members', async () => {
      const memberA = makeMember({ workerSlug: 'worker-a', workerVersionId: 'wv-a' });
      const memberB = makeMember({ workerSlug: 'worker-b', workerVersionId: 'wv-b' });
      const memberC = makeMember({ workerSlug: 'worker-c', workerVersionId: 'wv-c' });
      const { service: s1, mockDb: db1, mockRedis: r1 } = buildService();
      db1.select
        .mockReturnValueOnce(makeSelectChain([makePool()]))
        .mockReturnValueOnce(makeSelectChainWhereTerminal([memberA, memberB, memberC]));
      r1.incr.mockResolvedValue(3); // 3 % 3 = 0 → worker-a
      r1.get.mockResolvedValue('0');
      const afterOneCycle = await s1.route('my-pool', 'pkg-1');

      const { service: s2, mockDb: db2, mockRedis: r2 } = buildService();
      db2.select
        .mockReturnValueOnce(makeSelectChain([makePool()]))
        .mockReturnValueOnce(makeSelectChainWhereTerminal([memberA, memberB, memberC]));
      r2.incr.mockResolvedValue(6); // 6 % 3 = 0 → worker-a (wrapped)
      r2.get.mockResolvedValue('0');
      const afterTwoCycles = await s2.route('my-pool', 'pkg-2');

      expect(afterOneCycle.workerSlug).toBe('worker-a');
      expect(afterTwoCycles.workerSlug).toBe('worker-a');
    });

    it('single-member pool always routes to the same worker regardless of counter', async () => {
      const onlyMember = makeMember({ workerSlug: 'sole-worker', workerVersionId: 'wv-1' });
      const { service, mockDb, mockRedis } = buildService();

      for (let i = 0; i < 3; i++) {
        mockDb.select
          .mockReturnValueOnce(makeSelectChain([makePool()]))
          .mockReturnValueOnce(makeSelectChainWhereTerminal([onlyMember]));
      }
      // Each dispatched route calls incr twice: once for rr, once for active.
      mockRedis.incr
        .mockResolvedValueOnce(1).mockResolvedValueOnce(1)     // rr=1, active
        .mockResolvedValueOnce(2).mockResolvedValueOnce(1)     // rr=2, active
        .mockResolvedValueOnce(100).mockResolvedValueOnce(1);  // rr=100, active
      mockRedis.get.mockResolvedValue('0');

      for (let i = 0; i < 3; i++) {
        const result = await service.route('my-pool', `pkg-${i}`);
        expect(result.workerSlug).toBe('sole-worker');
      }
    });

    // ── Weighted round-robin ──────────────────────────────────────────────────

    it('expands member list by priority for weighted round-robin', async () => {
      // memberA priority=3, memberB priority=1
      // weighted = [A, A, A, B] (length 4)
      // counter=1 → index 1 → A
      // counter=4 → index 0 → A
      // counter=4 → 4%4=0 → A
      // counter=3 → index 3 → B (index 3)
      const memberA = makeMember({ workerSlug: 'worker-a', priority: 3, workerVersionId: 'wv-a' });
      const memberB = makeMember({ workerSlug: 'worker-b', priority: 1, workerVersionId: 'wv-b' });
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool(), [memberA, memberB]);
      mockRedis.incr.mockResolvedValue(3); // 3 % 4 = 3 → memberB
      mockRedis.get.mockResolvedValue('0');

      const result = await service.route('my-pool', 'pkg-1');
      expect(result.workerSlug).toBe('worker-b');
    });

    it('treats priority=0 as weight 1 (appears at least once)', async () => {
      const member = makeMember({ priority: 0, workerSlug: 'zero-priority' });
      const { service, mockDb, mockRedis } = buildService();
      setupRoute(mockDb, makePool(), [member]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      const result = await service.route('my-pool', 'pkg-1');
      expect(result.workerSlug).toBe('zero-priority');
    });

    it('queries pool using the correct slug', async () => {
      const { service, mockDb, mockRedis } = buildService();
      const poolChain = makeSelectChain([makePool()]);
      mockDb.select
        .mockReturnValueOnce(poolChain)
        .mockReturnValueOnce(makeSelectChainWhereTerminal([makeMember()]));
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      await service.route('target-pool', 'pkg-1');
      expect(poolChain.where).toHaveBeenCalled();
    });

    it('joins worker versions and workers tables to get member details', async () => {
      const { service, mockDb, mockRedis } = buildService();
      const memberChain = makeSelectChainWhereTerminal([makeMember()]);
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([makePool()]))
        .mockReturnValueOnce(memberChain);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('0');

      await service.route('my-pool', 'pkg-1');
      expect(memberChain.innerJoin).toHaveBeenCalledTimes(2);
    });
  });

  // ── releaseSlot ───────────────────────────────────────────────────────────

  describe('getActiveCount', () => {
    it('returns the active count from Redis', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue('7');

      const result = await service.getActiveCount('my-pool');
      expect(result).toBe(7);
    });

    it('returns 0 when Redis key is missing (null)', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getActiveCount('my-pool');
      expect(result).toBe(0);
    });

    it('reads from the correct Redis key', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue('2');

      await service.getActiveCount('target-pool');
      expect(mockRedis.get).toHaveBeenCalledWith('pool:target-pool:active');
    });

    it('returns null when Redis throws an error', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockRejectedValue(new Error('Redis connection lost'));

      const result = await service.getActiveCount('my-pool');
      expect(result).toBeNull();
    });
  });

  describe('releaseSlot', () => {
    it('decrements the active counter for the pool', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue('3');

      await service.releaseSlot('my-pool');
      expect(mockRedis.decr).toHaveBeenCalledWith('pool:my-pool:active');
    });

    it('reads active counter using the correct key', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue('1');

      await service.releaseSlot('target-pool');
      expect(mockRedis.get).toHaveBeenCalledWith('pool:target-pool:active');
    });

    it('does not decrement when active counter is 0', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue('0');

      await service.releaseSlot('my-pool');
      expect(mockRedis.decr).not.toHaveBeenCalled();
    });

    it('does not decrement when active counter key is missing (null)', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue(null);

      await service.releaseSlot('my-pool');
      expect(mockRedis.decr).not.toHaveBeenCalled();
    });

    it('decrements for any positive active count', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue('1');

      await service.releaseSlot('my-pool');
      expect(mockRedis.decr).toHaveBeenCalledOnce();
    });

    it('uses the poolSlug in the Redis key', async () => {
      const { service, mockRedis } = buildService();
      mockRedis.get.mockResolvedValue('2');

      await service.releaseSlot('special-pool');
      expect(mockRedis.decr).toHaveBeenCalledWith('pool:special-pool:active');
    });
  });
});
