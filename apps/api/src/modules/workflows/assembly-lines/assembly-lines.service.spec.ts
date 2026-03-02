import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AssemblyLinesService } from './assembly-lines.service';

// ─── Fixture factories ────────────────────────────────────────────────────────

function makeAssemblyLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-uuid-1',
    name: 'My Pipeline',
    slug: 'my-pipeline',
    description: null,
    status: 'ACTIVE',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: 'step-uuid-1',
    assemblyLineId: 'line-uuid-1',
    stepNumber: 1,
    workerVersionId: 'wv-uuid-1',
    configOverrides: null,
    ...overrides,
  };
}

function makeWorkerVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wv-uuid-1',
    workerId: 'worker-uuid-1',
    version: 1,
    status: 'ACTIVE',
    yamlConfig: {},
    dockerfileHash: null,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makePackage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pkg-uuid-1',
    type: 'document',
    status: 'IN_TRANSIT',
    metadata: {},
    assemblyLineId: 'line-uuid-1',
    currentStep: 1,
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

/** Chain where `.where()` is the terminal (awaited) call — no `.limit()` follows. */
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

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    ...overrides,
  };
}

function buildService() {
  const mockDb: any = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    query: {
      assemblyLines: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    transaction: vi.fn(),
  };
  const service = new AssemblyLinesService(mockDb);
  return { service, mockDb };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AssemblyLinesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const validDto = {
      name: 'My Pipeline',
      steps: [{ workerVersionId: 'wv-uuid-1' }],
    };

    it('returns the created assembly line record', async () => {
      const line = makeAssemblyLine();
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))          // slug check
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),  // version validation
          insert: vi.fn()
            .mockReturnValueOnce(makeInsertChain([line]))      // insert line
            .mockReturnValueOnce(makeInsertNoReturn()),        // insert steps
        });
        return fn(tx);
      });

      const result = await service.create(validDto);
      expect(result).toEqual(line);
    });

    it('generates slug from name', async () => {
      const line = makeAssemblyLine({ slug: 'my-pipeline' });
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();
      let capturedValues: Record<string, unknown> | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertLineChain = {
          values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedValues = v;
            return { returning: vi.fn().mockResolvedValue([line]) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(insertLineChain)
            .mockReturnValueOnce(makeInsertNoReturn()),
        });
        return fn(tx);
      });

      await service.create(validDto);
      expect(capturedValues).toMatchObject({ slug: 'my-pipeline' });
    });

    it('assigns step numbers sequentially starting at 1', async () => {
      const line = makeAssemblyLine();
      const wv1 = makeWorkerVersion({ id: 'wv-uuid-1' });
      const wv2 = makeWorkerVersion({ id: 'wv-uuid-2' });
      const { service, mockDb } = buildService();
      let capturedSteps: unknown[] | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertStepsChain = {
          values: vi.fn().mockImplementation((v: unknown[]) => {
            capturedSteps = v;
            return Promise.resolve(undefined);
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv1, wv2])),
          insert: vi.fn()
            .mockReturnValueOnce(makeInsertChain([line]))
            .mockReturnValueOnce(insertStepsChain),
        });
        return fn(tx);
      });

      await service.create({
        name: 'My Pipeline',
        steps: [
          { workerVersionId: 'wv-uuid-1' },
          { workerVersionId: 'wv-uuid-2' },
        ],
      });

      expect(capturedSteps).toEqual([
        expect.objectContaining({ stepNumber: 1, workerVersionId: 'wv-uuid-1' }),
        expect.objectContaining({ stepNumber: 2, workerVersionId: 'wv-uuid-2' }),
      ]);
    });

    it('throws ConflictException when slug already exists', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([makeAssemblyLine()])),
        });
        return fn(tx);
      });

      await expect(service.create(validDto)).rejects.toThrow(ConflictException);
    });

    it('includes the slug in the ConflictException message', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([makeAssemblyLine()])),
        });
        return fn(tx);
      });

      await expect(service.create(validDto)).rejects.toThrow('my-pipeline');
    });

    it('throws BadRequestException when a workerVersionId does not exist', async () => {
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))                     // no slug collision
            .mockReturnValueOnce(makeSelectChainWhereTerminal([])),       // no matching version
        });
        return fn(tx);
      });

      await expect(
        service.create({ name: 'My Pipeline', steps: [{ workerVersionId: 'missing-uuid' }] }),
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
        service.create({ name: 'My Pipeline', steps: [{ workerVersionId: 'nonexistent-id' }] }),
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

    it('stores configOverrides on steps when provided', async () => {
      const line = makeAssemblyLine();
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();
      let capturedSteps: unknown[] | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertStepsChain = {
          values: vi.fn().mockImplementation((v: unknown[]) => {
            capturedSteps = v;
            return Promise.resolve(undefined);
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(makeInsertChain([line]))
            .mockReturnValueOnce(insertStepsChain),
        });
        return fn(tx);
      });

      await service.create({
        name: 'My Pipeline',
        steps: [{ workerVersionId: 'wv-uuid-1', configOverrides: { timeout: 30 } }],
      });

      expect(capturedSteps).toEqual([
        expect.objectContaining({ configOverrides: { timeout: 30 } }),
      ]);
    });

    it('sets null configOverrides when not provided', async () => {
      const line = makeAssemblyLine();
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();
      let capturedSteps: unknown[] | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertStepsChain = {
          values: vi.fn().mockImplementation((v: unknown[]) => {
            capturedSteps = v;
            return Promise.resolve(undefined);
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(makeInsertChain([line]))
            .mockReturnValueOnce(insertStepsChain),
        });
        return fn(tx);
      });

      await service.create(validDto);

      expect(capturedSteps).toEqual([
        expect.objectContaining({ configOverrides: null }),
      ]);
    });

    it('wraps all operations in a transaction', async () => {
      const line = makeAssemblyLine();
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(makeInsertChain([line]))
            .mockReturnValueOnce(makeInsertNoReturn()),
        });
        return fn(tx);
      });

      await service.create(validDto);
      expect(mockDb.transaction).toHaveBeenCalledOnce();
    });

    it('passes description to the assembly line insert', async () => {
      const line = makeAssemblyLine({ description: 'A pipeline' });
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();
      let capturedValues: Record<string, unknown> | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertLineChain = {
          values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedValues = v;
            return { returning: vi.fn().mockResolvedValue([line]) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(insertLineChain)
            .mockReturnValueOnce(makeInsertNoReturn()),
        });
        return fn(tx);
      });

      await service.create({ name: 'My Pipeline', description: 'A pipeline', steps: [{ workerVersionId: 'wv-uuid-1' }] });
      expect(capturedValues).toMatchObject({ description: 'A pipeline' });
    });

    it('sets assemblyLineId on each step to the created line id', async () => {
      const line = makeAssemblyLine({ id: 'new-line-id' });
      const wv = makeWorkerVersion();
      const { service, mockDb } = buildService();
      let capturedSteps: unknown[] | null = null;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertStepsChain = {
          values: vi.fn().mockImplementation((v: unknown[]) => {
            capturedSteps = v;
            return Promise.resolve(undefined);
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([]))
            .mockReturnValueOnce(makeSelectChainWhereTerminal([wv])),
          insert: vi.fn()
            .mockReturnValueOnce(makeInsertChain([line]))
            .mockReturnValueOnce(insertStepsChain),
        });
        return fn(tx);
      });

      await service.create(validDto);
      expect(capturedSteps).toEqual([
        expect.objectContaining({ assemblyLineId: 'new-line-id' }),
      ]);
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all assembly lines with step count', async () => {
      const rows = [
        { ...makeAssemblyLine(), stepCount: 3 },
        { ...makeAssemblyLine({ id: 'line-uuid-2', slug: 'other' }), stepCount: 0 },
      ];
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValue(makeSelectChain(rows));

      const result = await service.findAll();
      expect(result).toEqual(rows);
    });

    it('returns empty array when no assembly lines exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValue(makeSelectChain([]));

      const result = await service.findAll();
      expect(result).toEqual([]);
    });

    it('calls select with step count aggregation', async () => {
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
    it('returns assembly line with step details', async () => {
      const line = makeAssemblyLine();
      const stepDetail = {
        ...makeStep(),
        workerName: 'My Worker',
        workerVersionNumber: 1,
      };
      const { service, mockDb } = buildService();

      mockDb.select
        .mockReturnValueOnce(makeSelectChain([line]))
        .mockReturnValueOnce(makeSelectChain([stepDetail]));

      const result = await service.findBySlug('my-pipeline');
      expect(result).toMatchObject({ ...line, steps: [stepDetail] });
    });

    it('returns assembly line with empty steps array', async () => {
      const line = makeAssemblyLine();
      const { service, mockDb } = buildService();

      mockDb.select
        .mockReturnValueOnce(makeSelectChain([line]))
        .mockReturnValueOnce(makeSelectChain([]));

      const result = await service.findBySlug('my-pipeline');
      expect(result.steps).toEqual([]);
    });

    it('throws NotFoundException when assembly line does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.findBySlug('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with slug in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.findBySlug('missing-slug')).rejects.toThrow('missing-slug');
    });

    it('joins worker versions and workers for step details', async () => {
      const line = makeAssemblyLine();
      const { service, mockDb } = buildService();
      const stepChain = makeSelectChain([]);

      mockDb.select
        .mockReturnValueOnce(makeSelectChain([line]))
        .mockReturnValueOnce(stepChain);

      await service.findBySlug('my-pipeline');
      expect(stepChain.innerJoin).toHaveBeenCalledTimes(2);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('returns the updated assembly line record', async () => {
      const existing = makeAssemblyLine();
      const updated = makeAssemblyLine({ name: 'Updated', slug: 'updated' });
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

      const result = await service.update('my-pipeline', { name: 'Updated' });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when assembly line does not exist', async () => {
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
      const existing = makeAssemblyLine();
      const updated = makeAssemblyLine({ name: 'New Name', slug: 'new-name' });
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

      await service.update('my-pipeline', { name: 'New Name' });
      expect(capturedSet).toMatchObject({ slug: 'new-name' });
    });

    it('throws ConflictException when new slug collides with another assembly line', async () => {
      const existing = makeAssemblyLine();
      const collision = makeAssemblyLine({ id: 'other-id', slug: 'new-name' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))
            .mockReturnValueOnce(makeSelectChain([collision])),
        });
        return fn(tx);
      });

      await expect(service.update('my-pipeline', { name: 'New Name' })).rejects.toThrow(ConflictException);
    });

    it('includes conflicting slug in ConflictException message', async () => {
      const existing = makeAssemblyLine();
      const collision = makeAssemblyLine({ id: 'other-id', slug: 'new-name' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))
            .mockReturnValueOnce(makeSelectChain([collision])),
        });
        return fn(tx);
      });

      await expect(service.update('my-pipeline', { name: 'New Name' })).rejects.toThrow('new-name');
    });

    it('updates status without slug collision check', async () => {
      const existing = makeAssemblyLine();
      const updated = makeAssemblyLine({ status: 'PAUSED' });
      const { service, mockDb } = buildService();
      let selectCallCount = 0;

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockImplementation(() => {
            selectCallCount++;
            return makeSelectChain([existing]);
          }),
          update: vi.fn().mockReturnValue(makeUpdateChain([updated])),
        });
        return fn(tx);
      });

      await service.update('my-pipeline', { status: 'PAUSED' });
      expect(selectCallCount).toBe(1);
    });

    it('includes status in update set when provided', async () => {
      const existing = makeAssemblyLine();
      const updated = makeAssemblyLine({ status: 'PAUSED' });
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

      await service.update('my-pipeline', { status: 'PAUSED' });
      expect(capturedSet).toMatchObject({ status: 'PAUSED' });
    });

    it('includes description in update set when provided', async () => {
      const existing = makeAssemblyLine();
      const updated = makeAssemblyLine({ description: 'New description' });
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

      await service.update('my-pipeline', { description: 'New description' });
      expect(capturedSet).toMatchObject({ description: 'New description' });
    });

    it('wraps update in a transaction', async () => {
      const existing = makeAssemblyLine();
      const updated = makeAssemblyLine();
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

      await service.update('my-pipeline', { name: 'New Name' });
      expect(mockDb.transaction).toHaveBeenCalledOnce();
    });
  });

  // ── archive ──────────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('returns the archived assembly line record', async () => {
      const existing = makeAssemblyLine();
      const archived = makeAssemblyLine({ status: 'ARCHIVED' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([existing])),
          update: vi.fn().mockReturnValue(makeUpdateChain([archived])),
        });
        return fn(tx);
      });

      const result = await service.archive('my-pipeline');
      expect(result.status).toBe('ARCHIVED');
    });

    it('sets status to ARCHIVED in the update', async () => {
      const existing = makeAssemblyLine();
      const archived = makeAssemblyLine({ status: 'ARCHIVED' });
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

      await service.archive('my-pipeline');
      expect(capturedSet).toMatchObject({ status: 'ARCHIVED' });
    });

    it('throws NotFoundException when assembly line is not found', async () => {
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
      const existing = makeAssemblyLine();
      const archived = makeAssemblyLine({ status: 'ARCHIVED' });
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([existing])),
          update: vi.fn().mockReturnValue(makeUpdateChain([archived])),
        });
        return fn(tx);
      });

      await service.archive('my-pipeline');
      expect(mockDb.transaction).toHaveBeenCalledOnce();
    });
  });

  // ── submit ───────────────────────────────────────────────────────────────────

  describe('submit', () => {
    const packageData = { type: 'document', metadata: { key: 'value' } };

    it('returns the created package', async () => {
      const line = makeAssemblyLine();
      const pkg = makePackage();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([line])),
          insert: vi.fn().mockReturnValueOnce(makeInsertChain([pkg])),
        });
        return fn(tx);
      });

      const result = await service.submit('my-pipeline', packageData);
      expect(result).toEqual(pkg);
    });

    it('creates package with IN_TRANSIT status', async () => {
      const line = makeAssemblyLine();
      const pkg = makePackage({ status: 'IN_TRANSIT' });
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
          select: vi.fn().mockReturnValueOnce(makeSelectChain([line])),
          insert: vi.fn().mockReturnValueOnce(insertChain),
        });
        return fn(tx);
      });

      await service.submit('my-pipeline', packageData);
      expect(capturedValues).toMatchObject({ status: 'IN_TRANSIT' });
    });

    it('sets currentStep to 1', async () => {
      const line = makeAssemblyLine();
      const pkg = makePackage({ currentStep: 1 });
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
          select: vi.fn().mockReturnValueOnce(makeSelectChain([line])),
          insert: vi.fn().mockReturnValueOnce(insertChain),
        });
        return fn(tx);
      });

      await service.submit('my-pipeline', packageData);
      expect(capturedValues).toMatchObject({ currentStep: 1 });
    });

    it('associates package with the assembly line', async () => {
      const line = makeAssemblyLine({ id: 'line-uuid-1' });
      const pkg = makePackage({ assemblyLineId: 'line-uuid-1' });
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
          select: vi.fn().mockReturnValueOnce(makeSelectChain([line])),
          insert: vi.fn().mockReturnValueOnce(insertChain),
        });
        return fn(tx);
      });

      await service.submit('my-pipeline', packageData);
      expect(capturedValues).toMatchObject({ assemblyLineId: 'line-uuid-1' });
    });

    it('throws NotFoundException when assembly line does not exist', async () => {
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

    it('passes metadata to the package insert', async () => {
      const line = makeAssemblyLine();
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
          select: vi.fn().mockReturnValueOnce(makeSelectChain([line])),
          insert: vi.fn().mockReturnValueOnce(insertChain),
        });
        return fn(tx);
      });

      await service.submit('my-pipeline', { type: 'document', metadata: { key: 'value' } });
      expect(capturedValues).toMatchObject({ metadata: { key: 'value' } });
    });

    it('defaults metadata to empty object when not provided', async () => {
      const line = makeAssemblyLine();
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
          select: vi.fn().mockReturnValueOnce(makeSelectChain([line])),
          insert: vi.fn().mockReturnValueOnce(insertChain),
        });
        return fn(tx);
      });

      await service.submit('my-pipeline', { type: 'document' });
      expect(capturedValues).toMatchObject({ metadata: {} });
    });

    it('sets createdBy when provided', async () => {
      const line = makeAssemblyLine();
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
          select: vi.fn().mockReturnValueOnce(makeSelectChain([line])),
          insert: vi.fn().mockReturnValueOnce(insertChain),
        });
        return fn(tx);
      });

      await service.submit('my-pipeline', { type: 'document', createdBy: 'user-123' });
      expect(capturedValues).toMatchObject({ createdBy: 'user-123' });
    });

    it('wraps submit in a transaction', async () => {
      const line = makeAssemblyLine();
      const pkg = makePackage();
      const { service, mockDb } = buildService();

      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([line])),
          insert: vi.fn().mockReturnValueOnce(makeInsertChain([pkg])),
        });
        return fn(tx);
      });

      await service.submit('my-pipeline', packageData);
      expect(mockDb.transaction).toHaveBeenCalledOnce();
    });
  });
});
