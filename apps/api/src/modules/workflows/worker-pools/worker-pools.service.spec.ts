import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkerPoolsService } from './worker-pools.service';

// ─── Fixture factories ────────────────────────────────────────────────────────

function makePool(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pool-uuid-1',
    name: 'My Pool',
    slug: 'my-pool',
    description: null,
    status: 'ACTIVE',
    maxConcurrency: 5,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-uuid-1',
    poolId: 'pool-uuid-1',
    workerVersionId: 'wv-uuid-1',
    priority: 1,
    ...overrides,
  };
}

function makeWorkerVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wv-uuid-1',
    workerId: 'worker-uuid-1',
    version: 1,
    status: 'ACTIVE',
    yamlConfig: { inputTypes: ['document'] },
    dockerfileHash: null,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makePackage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pkg-uuid-1',
    type: 'document',
    status: 'PENDING',
    metadata: {},
    assemblyLineId: null,
    currentStep: null,
    createdBy: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ─── Mock chain helpers ───────────────────────────────────────────────────────

function makeSelectChain(resolveValue: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue(resolveValue),
    orderBy: vi.fn().mockResolvedValue(resolveValue),
    limit: vi.fn().mockResolvedValue(resolveValue),
  };
}

function makeSelectChainWhereTerminal(resolveValue: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(resolveValue),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue(resolveValue),
    orderBy: vi.fn().mockResolvedValue(resolveValue),
    limit: vi.fn().mockResolvedValue(resolveValue),
  };
}

function makeInsertChain(resolveValue: unknown) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(resolveValue),
    }),
  };
}

function makeInsertNoReturn() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

function makeUpdateChain(resolveValue: unknown) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(resolveValue),
      }),
    }),
  };
}

function makeDeleteChain() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
  };
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function makeRoutingResult(overrides: Record<string, unknown> = {}) {
  return {
    workerSlug: 'my-worker',
    workerVersion: 1,
    status: 'dispatched' as const,
    ...overrides,
  };
}

function buildService() {
  const mockDb: any = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };
  const mockRouter: any = {
    route: vi.fn().mockResolvedValue(makeRoutingResult()),
  };
  const service = new WorkerPoolsService(mockDb, mockRouter);
  return { service, mockDb, mockRouter };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkerPoolsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const validDto = {
      name: 'My Pool',
      members: [{ workerVersionId: 'wv-uuid-1' }],
      maxConcurrency: 5,
    };

    it('returns the created worker pool record', async () => {
      const pool = makePool();
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))                        // slug check
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),        // version validation
          insert: vi.fn()
            .mockReturnValueOnce(makeInsertChain([pool]))                    // insert pool
            .mockReturnValueOnce(makeInsertNoReturn()),                      // insert members
        });
        return fn(tx);
      });

      const result = await service.create(validDto);
      expect(result).toEqual(pool);
    });

    it('generates slug from name', async () => {
      const pool = makePool({ slug: 'my-pool' });
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();
      let capturedValues: Record<string, unknown> | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertPoolChain = {
          values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedValues = v;
            return { returning: vi.fn().mockResolvedValue([pool]) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(insertPoolChain)
            .mockReturnValueOnce(makeInsertNoReturn()),
        });
        return fn(tx);
      });

      await service.create(validDto);
      expect(capturedValues).toMatchObject({ slug: 'my-pool' });
    });

    it('throws ConflictException when slug already exists', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([makePool()])),
        });
        return fn(tx);
      });

      await expect(service.create(validDto)).rejects.toThrow(ConflictException);
    });

    it('includes the slug in the ConflictException message', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([makePool()])),
        });
        return fn(tx);
      });

      await expect(service.create(validDto)).rejects.toThrow('my-pool');
    });

    it('throws BadRequestException when a workerVersionId does not exist', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([])),
        });
        return fn(tx);
      });

      await expect(
        service.create({ name: 'My Pool', members: [{ workerVersionId: 'missing-uuid' }], maxConcurrency: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('includes the missing workerVersionId in the BadRequestException message', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([])),
        });
        return fn(tx);
      });

      await expect(
        service.create({ name: 'My Pool', members: [{ workerVersionId: 'nonexistent-id' }], maxConcurrency: 5 }),
      ).rejects.toThrow('nonexistent-id');
    });

    it('throws BadRequestException when a workerVersion is DEPRECATED', async () => {
      const deprecated = makeWorkerVersion({ status: 'DEPRECATED' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([deprecated])),
        });
        return fn(tx);
      });

      await expect(service.create(validDto)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException mentioning DEPRECATED for deprecated version', async () => {
      const deprecated = makeWorkerVersion({ status: 'DEPRECATED' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([deprecated])),
        });
        return fn(tx);
      });

      await expect(service.create(validDto)).rejects.toThrow('DEPRECATED');
    });

    it('inserts members with default priority 1 when not provided', async () => {
      const pool = makePool();
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();
      let capturedMembers: unknown[] | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertMembersChain = {
          values: vi.fn().mockImplementation((v: unknown[]) => {
            capturedMembers = v;
            return Promise.resolve(undefined);
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(makeInsertChain([pool]))
            .mockReturnValueOnce(insertMembersChain),
        });
        return fn(tx);
      });

      await service.create(validDto);
      expect(capturedMembers).toEqual([
        expect.objectContaining({ priority: 1 }),
      ]);
    });

    it('uses provided priority when member includes it', async () => {
      const pool = makePool();
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();
      let capturedMembers: unknown[] | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertMembersChain = {
          values: vi.fn().mockImplementation((v: unknown[]) => {
            capturedMembers = v;
            return Promise.resolve(undefined);
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(makeInsertChain([pool]))
            .mockReturnValueOnce(insertMembersChain),
        });
        return fn(tx);
      });

      await service.create({
        name: 'My Pool',
        members: [{ workerVersionId: 'wv-uuid-1', priority: 3 }],
        maxConcurrency: 5,
      });
      expect(capturedMembers).toEqual([
        expect.objectContaining({ priority: 3 }),
      ]);
    });

    it('sets poolId on each member to the created pool id', async () => {
      const pool = makePool({ id: 'new-pool-id' });
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();
      let capturedMembers: unknown[] | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertMembersChain = {
          values: vi.fn().mockImplementation((v: unknown[]) => {
            capturedMembers = v;
            return Promise.resolve(undefined);
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(makeInsertChain([pool]))
            .mockReturnValueOnce(insertMembersChain),
        });
        return fn(tx);
      });

      await service.create(validDto);
      expect(capturedMembers).toEqual([
        expect.objectContaining({ poolId: 'new-pool-id' }),
      ]);
    });

    it('stores maxConcurrency on pool insert', async () => {
      const pool = makePool({ maxConcurrency: 8 });
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();
      let capturedValues: Record<string, unknown> | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertPoolChain = {
          values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedValues = v;
            return { returning: vi.fn().mockResolvedValue([pool]) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(insertPoolChain)
            .mockReturnValueOnce(makeInsertNoReturn()),
        });
        return fn(tx);
      });

      await service.create({ name: 'My Pool', members: [{ workerVersionId: 'wv-uuid-1' }], maxConcurrency: 8 });
      expect(capturedValues).toMatchObject({ maxConcurrency: 8 });
    });

    it('wraps all operations in a transaction', async () => {
      const pool = makePool();
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(makeInsertChain([pool]))
            .mockReturnValueOnce(makeInsertNoReturn()),
        });
        return fn(tx);
      });

      await service.create(validDto);
      expect(mockDb.transaction).toHaveBeenCalledOnce();
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all pools with member count', async () => {
      const rows = [
        { ...makePool(), memberCount: 3 },
        { ...makePool({ id: 'pool-uuid-2', slug: 'other' }), memberCount: 0 },
      ];
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValue(makeSelectChain(rows));

      const result = await service.findAll();
      expect(result).toEqual(rows);
    });

    it('returns empty array when no pools exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValue(makeSelectChain([]));

      const result = await service.findAll();
      expect(result).toEqual([]);
    });

    it('calls select with member count aggregation via groupBy', async () => {
      const { service, mockDb } = buildService();
      const chain = makeSelectChain([]);
      mockDb.select.mockReturnValue(chain);

      await service.findAll();
      expect(mockDb.select).toHaveBeenCalled();
      expect(chain.leftJoin).toHaveBeenCalled();
      expect(chain.groupBy).toHaveBeenCalled();
    });
  });

  // ── findBySlug ───────────────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('returns pool with member details', async () => {
      const pool = makePool();
      const memberDetail = {
        ...makeMember(),
        workerName: 'My Worker',
        workerVersionNumber: 1,
      };
      const { service, mockDb } = buildService();

      mockDb.select
        .mockReturnValueOnce(makeSelectChain([pool]))
        .mockReturnValueOnce(makeSelectChainWhereTerminal([memberDetail]));

      const result = await service.findBySlug('my-pool');
      expect(result).toMatchObject({ ...pool, members: [memberDetail] });
    });

    it('returns pool with empty members array', async () => {
      const pool = makePool();
      const { service, mockDb } = buildService();

      mockDb.select
        .mockReturnValueOnce(makeSelectChain([pool]))
        .mockReturnValueOnce(makeSelectChainWhereTerminal([]));

      const result = await service.findBySlug('my-pool');
      expect(result.members).toEqual([]);
    });

    it('throws NotFoundException when pool does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.findBySlug('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with slug in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.findBySlug('missing-slug')).rejects.toThrow('missing-slug');
    });

    it('joins worker versions and workers for member details', async () => {
      const pool = makePool();
      const { service, mockDb } = buildService();
      const memberChain = makeSelectChainWhereTerminal([]);

      mockDb.select
        .mockReturnValueOnce(makeSelectChain([pool]))
        .mockReturnValueOnce(memberChain);

      await service.findBySlug('my-pool');
      expect(memberChain.innerJoin).toHaveBeenCalledTimes(2);
    });

    it('includes queueDepth as null (pending event bus)', async () => {
      const pool = makePool();
      const { service, mockDb } = buildService();

      mockDb.select
        .mockReturnValueOnce(makeSelectChain([pool]))
        .mockReturnValueOnce(makeSelectChainWhereTerminal([]));

      const result = await service.findBySlug('my-pool');
      expect(result.queueDepth).toBeNull();
    });
  });

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('returns the updated pool record', async () => {
      const existing = makePool();
      const updated = makePool({ name: 'Updated', slug: 'updated' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))
            .mockReturnValueOnce(makeSelectChain([])),
          update: vi.fn().mockReturnValue(makeUpdateChain([updated])),
        });
        return fn(tx);
      });

      const result = await service.update('my-pool', { name: 'Updated' });
      expect(result).toMatchObject(updated);
    });

    it('throws NotFoundException when pool does not exist', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with slug in message', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });

      await expect(service.update('missing-slug', { name: 'X' })).rejects.toThrow('missing-slug');
    });

    it('regenerates slug when name changes', async () => {
      const existing = makePool();
      const updated = makePool({ name: 'New Name', slug: 'new-name' });
      const { service, mockDb } = buildService();
      let capturedSet: Record<string, unknown> | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const updateChain = {
          set: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedSet = v;
            return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([updated]) }) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))
            .mockReturnValueOnce(makeSelectChain([])),
          update: vi.fn().mockReturnValue(updateChain),
        });
        return fn(tx);
      });

      await service.update('my-pool', { name: 'New Name' });
      expect(capturedSet).toMatchObject({ slug: 'new-name' });
    });

    it('throws ConflictException when new slug collides with another pool', async () => {
      const existing = makePool();
      const collision = makePool({ id: 'other-id', slug: 'new-name' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))
            .mockReturnValueOnce(makeSelectChain([collision])),
        });
        return fn(tx);
      });

      await expect(service.update('my-pool', { name: 'New Name' })).rejects.toThrow(ConflictException);
    });

    it('includes conflicting slug in ConflictException message', async () => {
      const existing = makePool();
      const collision = makePool({ id: 'other-id', slug: 'new-name' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))
            .mockReturnValueOnce(makeSelectChain([collision])),
        });
        return fn(tx);
      });

      await expect(service.update('my-pool', { name: 'New Name' })).rejects.toThrow('new-name');
    });

    it('updates maxConcurrency when provided', async () => {
      const existing = makePool();
      const updated = makePool({ maxConcurrency: 20 });
      const { service, mockDb } = buildService();
      let capturedSet: Record<string, unknown> | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const updateChain = {
          set: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedSet = v;
            return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([updated]) }) };
          }),
        };
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([existing])),
          update: vi.fn().mockReturnValue(updateChain),
        });
        return fn(tx);
      });

      await service.update('my-pool', { maxConcurrency: 20 });
      expect(capturedSet).toMatchObject({ maxConcurrency: 20 });
    });

    it('replaces all members when members array is provided', async () => {
      const existing = makePool();
      const updated = makePool();
      const wv = makeWorkerVersion({ id: 'wv-uuid-2' });
      const { service, mockDb } = buildService();
      let deleteCalled = false;
      let insertMembersCalled = false;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const deleteChain = {
          where: vi.fn().mockImplementation(() => {
            deleteCalled = true;
            return Promise.resolve(undefined);
          }),
        };
        const insertMembersChain = {
          values: vi.fn().mockImplementation(() => {
            insertMembersCalled = true;
            return Promise.resolve(undefined);
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))      // find pool
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])), // validate versions
          update: vi.fn().mockReturnValue(makeUpdateChain([updated])),
          delete: vi.fn().mockReturnValue(deleteChain),
          insert: vi.fn().mockReturnValue(insertMembersChain),
        });
        return fn(tx);
      });

      await service.update('my-pool', {
        members: [{ workerVersionId: 'wv-uuid-2' }],
      });

      expect(deleteCalled).toBe(true);
      expect(insertMembersCalled).toBe(true);
    });

    it('throws BadRequestException when member version does not exist during update', async () => {
      const existing = makePool();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([])), // no versions found
        });
        return fn(tx);
      });

      await expect(
        service.update('my-pool', { members: [{ workerVersionId: 'bad-id' }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when member version is DEPRECATED during update', async () => {
      const existing = makePool();
      const deprecated = makeWorkerVersion({ status: 'DEPRECATED' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([deprecated])),
        });
        return fn(tx);
      });

      await expect(
        service.update('my-pool', { members: [{ workerVersionId: 'wv-uuid-1' }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not replace members when members array is not provided', async () => {
      const existing = makePool();
      const updated = makePool({ maxConcurrency: 10 });
      const { service, mockDb } = buildService();
      let deleteCalled = false;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const deleteChain = {
          where: vi.fn().mockImplementation(() => {
            deleteCalled = true;
            return Promise.resolve(undefined);
          }),
        };
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([existing])),
          update: vi.fn().mockReturnValue(makeUpdateChain([updated])),
          delete: vi.fn().mockReturnValue(deleteChain),
        });
        return fn(tx);
      });

      await service.update('my-pool', { maxConcurrency: 10 });
      expect(deleteCalled).toBe(false);
    });

    it('wraps update in a transaction', async () => {
      const existing = makePool();
      const updated = makePool();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))
            .mockReturnValueOnce(makeSelectChain([])),
          update: vi.fn().mockReturnValue(makeUpdateChain([updated])),
        });
        return fn(tx);
      });

      await service.update('my-pool', { name: 'New Name' });
      expect(mockDb.transaction).toHaveBeenCalledOnce();
    });
  });

  // ── archive ───────────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('returns the archived pool record', async () => {
      const existing = makePool();
      const archived = makePool({ status: 'ARCHIVED' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([existing])),
          update: vi.fn().mockReturnValue(makeUpdateChain([archived])),
        });
        return fn(tx);
      });

      const result = await service.archive('my-pool');
      expect(result.status).toBe('ARCHIVED');
    });

    it('sets status to ARCHIVED in the update', async () => {
      const existing = makePool();
      const archived = makePool({ status: 'ARCHIVED' });
      const { service, mockDb } = buildService();
      let capturedSet: Record<string, unknown> | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const updateChain = {
          set: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedSet = v;
            return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([archived]) }) };
          }),
        };
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([existing])),
          update: vi.fn().mockReturnValue(updateChain),
        });
        return fn(tx);
      });

      await service.archive('my-pool');
      expect(capturedSet).toMatchObject({ status: 'ARCHIVED' });
    });

    it('throws NotFoundException when pool is not found', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });

      await expect(service.archive('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with slug in message', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });

      await expect(service.archive('missing-slug')).rejects.toThrow('missing-slug');
    });

    it('wraps archive in a transaction', async () => {
      const existing = makePool();
      const archived = makePool({ status: 'ARCHIVED' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([existing])),
          update: vi.fn().mockReturnValue(makeUpdateChain([archived])),
        });
        return fn(tx);
      });

      await service.archive('my-pool');
      expect(mockDb.transaction).toHaveBeenCalledOnce();
    });
  });

  // ── submit ────────────────────────────────────────────────────────────────────

  describe('submit', () => {
    const packageData = { type: 'document', metadata: { key: 'value' } };

    it('returns the created package', async () => {
      const pool = makePool();
      const member = makeMember();
      const pkg = makePackage();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([pool]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([{ ...member, yamlConfig: { inputTypes: ['document'] } }])),
          insert: vi.fn().mockReturnValueOnce(makeInsertChain([pkg])),
        });
        return fn(tx);
      });

      const result = await service.submit('my-pool', packageData);
      expect(result).toEqual({ package: pkg, routing: makeRoutingResult() });
    });

    it('throws NotFoundException when pool does not exist', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });

      await expect(service.submit('nonexistent', packageData)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with slug in message', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });

      await expect(service.submit('missing-slug', packageData)).rejects.toThrow('missing-slug');
    });

    it('throws BadRequestException when no member accepts the package type', async () => {
      const pool = makePool();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([pool]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([
              { ...makeMember(), yamlConfig: { inputTypes: ['image'] } },
            ])),
        });
        return fn(tx);
      });

      await expect(service.submit('my-pool', { type: 'video' })).rejects.toThrow(BadRequestException);
    });

    it('includes the package type in the BadRequestException message', async () => {
      const pool = makePool();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([pool]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([
              { ...makeMember(), yamlConfig: { inputTypes: ['image'] } },
            ])),
        });
        return fn(tx);
      });

      await expect(service.submit('my-pool', { type: 'video' })).rejects.toThrow('video');
    });

    it('creates package with PENDING status', async () => {
      const pool = makePool();
      const pkg = makePackage({ status: 'PENDING' });
      const { service, mockDb } = buildService();
      let capturedValues: Record<string, unknown> | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertChain = {
          values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedValues = v;
            return { returning: vi.fn().mockResolvedValue([pkg]) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([pool]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([
              { ...makeMember(), yamlConfig: { inputTypes: ['document'] } },
            ])),
          insert: vi.fn().mockReturnValueOnce(insertChain),
        });
        return fn(tx);
      });

      await service.submit('my-pool', packageData);
      expect(capturedValues).toMatchObject({ status: 'PENDING' });
    });

    it('passes metadata to the package insert', async () => {
      const pool = makePool();
      const pkg = makePackage({ metadata: { key: 'value' } });
      const { service, mockDb } = buildService();
      let capturedValues: Record<string, unknown> | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertChain = {
          values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedValues = v;
            return { returning: vi.fn().mockResolvedValue([pkg]) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([pool]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([
              { ...makeMember(), yamlConfig: { inputTypes: ['document'] } },
            ])),
          insert: vi.fn().mockReturnValueOnce(insertChain),
        });
        return fn(tx);
      });

      await service.submit('my-pool', packageData);
      expect(capturedValues).toMatchObject({ metadata: { key: 'value' } });
    });

    it('defaults metadata to empty object when not provided', async () => {
      const pool = makePool();
      const pkg = makePackage({ metadata: {} });
      const { service, mockDb } = buildService();
      let capturedValues: Record<string, unknown> | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertChain = {
          values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedValues = v;
            return { returning: vi.fn().mockResolvedValue([pkg]) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([pool]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([
              { ...makeMember(), yamlConfig: { inputTypes: ['document'] } },
            ])),
          insert: vi.fn().mockReturnValueOnce(insertChain),
        });
        return fn(tx);
      });

      await service.submit('my-pool', { type: 'document' });
      expect(capturedValues).toMatchObject({ metadata: {} });
    });

    it('sets createdBy when provided', async () => {
      const pool = makePool();
      const pkg = makePackage({ createdBy: 'user-123' });
      const { service, mockDb } = buildService();
      let capturedValues: Record<string, unknown> | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertChain = {
          values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedValues = v;
            return { returning: vi.fn().mockResolvedValue([pkg]) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([pool]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([
              { ...makeMember(), yamlConfig: { inputTypes: ['document'] } },
            ])),
          insert: vi.fn().mockReturnValueOnce(insertChain),
        });
        return fn(tx);
      });

      await service.submit('my-pool', { type: 'document', createdBy: 'user-123' });
      expect(capturedValues).toMatchObject({ createdBy: 'user-123' });
    });

    it('wraps submit in a transaction', async () => {
      const pool = makePool();
      const pkg = makePackage();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([pool]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([
              { ...makeMember(), yamlConfig: { inputTypes: ['document'] } },
            ])),
          insert: vi.fn().mockReturnValueOnce(makeInsertChain([pkg])),
        });
        return fn(tx);
      });

      await service.submit('my-pool', packageData);
      expect(mockDb.transaction).toHaveBeenCalledOnce();
    });

    it('passes when at least one member accepts the type even if others do not', async () => {
      const pool = makePool();
      const pkg = makePackage();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([pool]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([
              { ...makeMember({ id: 'm1' }), yamlConfig: { inputTypes: ['image'] } },
              { ...makeMember({ id: 'm2' }), yamlConfig: { inputTypes: ['document'] } },
            ])),
          insert: vi.fn().mockReturnValueOnce(makeInsertChain([pkg])),
        });
        return fn(tx);
      });

      const result = await service.submit('my-pool', { type: 'document' });
      expect(result).toEqual({ package: pkg, routing: makeRoutingResult() });
    });

    it('throws BadRequestException when pool has no members', async () => {
      const pool = makePool();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([pool]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([])),
        });
        return fn(tx);
      });

      await expect(service.submit('my-pool', packageData)).rejects.toThrow(BadRequestException);
    });
  });
});
