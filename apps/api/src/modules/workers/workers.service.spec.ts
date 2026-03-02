import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { WorkersService } from './workers.service';

function makeWorker(overrides: Record<string, unknown> = {}) {
  return {
    id: 'worker-uuid-1',
    name: 'My Worker',
    slug: 'my-worker',
    description: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-uuid-1',
    workerId: 'worker-uuid-1',
    version: 1,
    yamlConfig: { name: 'my-worker', version: '1.0.0' },
    dockerfileHash: null,
    status: 'ACTIVE',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeSelectChain(resolveValue: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
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
      workers: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    transaction: vi.fn(),
  };
  const service = new WorkersService(mockDb);
  return { service, mockDb };
}

describe('WorkersService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createWorker', () => {
    it('inserts a worker and returns the record', async () => {
      const worker = makeWorker();
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));
      mockDb.insert.mockReturnValue(makeInsertChain([worker]));
      const result = await service.createWorker({ name: 'My Worker' });
      expect(result).toEqual(worker);
    });

    it('generates slug from name', async () => {
      const worker = makeWorker({ slug: 'my-worker' });
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));
      const insertChain = makeInsertChain([worker]);
      mockDb.insert.mockReturnValue(insertChain);
      await service.createWorker({ name: 'My Worker' });
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-worker' }),
      );
    });

    it('throws ConflictException when slug already exists', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([makeWorker()]));
      await expect(service.createWorker({ name: 'My Worker' })).rejects.toThrow(ConflictException);
    });

    it('includes slug in the ConflictException message', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([makeWorker()]));
      await expect(service.createWorker({ name: 'My Worker' })).rejects.toThrow('my-worker');
    });

    it('does not insert when slug already exists', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([makeWorker()]));
      await expect(service.createWorker({ name: 'My Worker' })).rejects.toThrow(ConflictException);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('passes name and description to insert', async () => {
      const worker = makeWorker({ description: 'A worker' });
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));
      const insertChain = makeInsertChain([worker]);
      mockDb.insert.mockReturnValue(insertChain);
      await service.createWorker({ name: 'My Worker', description: 'A worker' });
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Worker', description: 'A worker' }),
      );
    });
  });

  describe('createVersion', () => {
    it('returns the created version record', async () => {
      const worker = makeWorker();
      const version = makeVersion();
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([worker]))
            .mockReturnValueOnce(makeSelectChain([{ max: null }])),
          insert: vi.fn().mockReturnValue(makeInsertChain([version])),
        });
        return fn(tx);
      });
      const result = await service.createVersion('my-worker', {
        yamlConfig: { name: 'my-worker', version: '1.0.0' },
      });
      expect(result).toEqual(version);
    });

    it('throws NotFoundException when worker slug does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });
      await expect(
        service.createVersion('nonexistent', { yamlConfig: {} }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with slug in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });
      await expect(
        service.createVersion('nonexistent-slug', { yamlConfig: {} }),
      ).rejects.toThrow('nonexistent-slug');
    });

    it('auto-increments version starting at 1 for first version', async () => {
      const worker = makeWorker();
      const version = makeVersion({ version: 1 });
      const { service, mockDb } = buildService();
      let capturedValues: Record<string, unknown> | null = null;
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertChain = {
          values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedValues = v;
            return { returning: vi.fn().mockResolvedValue([version]) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([worker]))
            .mockReturnValueOnce(makeSelectChain([{ max: null }])),
          insert: vi.fn().mockReturnValue(insertChain),
        });
        return fn(tx);
      });
      await service.createVersion('my-worker', { yamlConfig: {} });
      expect(capturedValues).toMatchObject({ version: 1 });
    });

    it('auto-increments version number based on max existing version', async () => {
      const worker = makeWorker();
      const version = makeVersion({ version: 3 });
      const { service, mockDb } = buildService();
      let capturedValues: Record<string, unknown> | null = null;
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertChain = {
          values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedValues = v;
            return { returning: vi.fn().mockResolvedValue([version]) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([worker]))
            .mockReturnValueOnce(makeSelectChain([{ max: 2 }])),
          insert: vi.fn().mockReturnValue(insertChain),
        });
        return fn(tx);
      });
      await service.createVersion('my-worker', { yamlConfig: {} });
      expect(capturedValues).toMatchObject({ version: 3 });
    });

    it('stores yamlConfig in the insert values', async () => {
      const worker = makeWorker();
      const version = makeVersion();
      const { service, mockDb } = buildService();
      const yamlConfig = { name: 'my-worker', steps: ['step1'] };
      let capturedValues: Record<string, unknown> | null = null;
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const insertChain = {
          values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedValues = v;
            return { returning: vi.fn().mockResolvedValue([version]) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([worker]))
            .mockReturnValueOnce(makeSelectChain([{ max: null }])),
          insert: vi.fn().mockReturnValue(insertChain),
        });
        return fn(tx);
      });
      await service.createVersion('my-worker', { yamlConfig });
      expect(capturedValues).toMatchObject({ yamlConfig });
    });

    it('wraps execution in a transaction', async () => {
      const worker = makeWorker();
      const version = makeVersion();
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([worker]))
            .mockReturnValueOnce(makeSelectChain([{ max: null }])),
          insert: vi.fn().mockReturnValue(makeInsertChain([version])),
        });
        return fn(tx);
      });
      await service.createVersion('my-worker', { yamlConfig: {} });
      expect(mockDb.transaction).toHaveBeenCalledOnce();
    });
  });

  describe('findAll', () => {
    it('returns all workers with latest version info', async () => {
      const allWorkers = [
        { ...makeWorker({ id: 'a' }), versions: [makeVersion({ version: 2 })] },
        { ...makeWorker({ id: 'b' }), versions: [] },
      ];
      const { service, mockDb } = buildService();
      mockDb.query.workers.findMany.mockResolvedValue(allWorkers);
      const result = await service.findAll();
      expect(result).toEqual(allWorkers);
    });

    it('returns empty array when no workers exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.query.workers.findMany.mockResolvedValue([]);
      const result = await service.findAll();
      expect(result).toEqual([]);
    });

    it('calls findMany with versions relation', async () => {
      const { service, mockDb } = buildService();
      mockDb.query.workers.findMany.mockResolvedValue([]);
      await service.findAll();
      expect(mockDb.query.workers.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          with: expect.objectContaining({ versions: expect.anything() }),
        }),
      );
    });

    it('limits to 1 version per worker (latest only)', async () => {
      const { service, mockDb } = buildService();
      mockDb.query.workers.findMany.mockResolvedValue([]);
      await service.findAll();
      const callArg = mockDb.query.workers.findMany.mock.calls[0][0] as any;
      expect(callArg.with.versions).toMatchObject({ limit: 1 });
    });
  });

  describe('findBySlug', () => {
    it('returns worker with versions', async () => {
      const versions = [makeVersion()];
      const worker = { ...makeWorker(), versions };
      const { service, mockDb } = buildService();
      mockDb.query.workers.findFirst.mockResolvedValue(worker);
      const result = await service.findBySlug('my-worker');
      expect(result).toEqual(worker);
      expect(result.versions).toHaveLength(1);
    });

    it('returns worker with empty versions array', async () => {
      const worker = { ...makeWorker(), versions: [] };
      const { service, mockDb } = buildService();
      mockDb.query.workers.findFirst.mockResolvedValue(worker);
      const result = await service.findBySlug('my-worker');
      expect(result.versions).toEqual([]);
    });

    it('throws NotFoundException when worker does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.query.workers.findFirst.mockResolvedValue(undefined);
      await expect(service.findBySlug('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with slug in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.query.workers.findFirst.mockResolvedValue(undefined);
      await expect(service.findBySlug('missing-slug')).rejects.toThrow('missing-slug');
    });

    it('calls findFirst with versions relation', async () => {
      const worker = { ...makeWorker(), versions: [] };
      const { service, mockDb } = buildService();
      mockDb.query.workers.findFirst.mockResolvedValue(worker);
      await service.findBySlug('my-worker');
      expect(mockDb.query.workers.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ with: { versions: true } }),
      );
    });

    it('passes where condition to findFirst', async () => {
      const worker = { ...makeWorker(), versions: [] };
      const { service, mockDb } = buildService();
      mockDb.query.workers.findFirst.mockResolvedValue(worker);
      await service.findBySlug('my-worker');
      expect(mockDb.query.workers.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.anything() }),
      );
    });
  });

  describe('updateWorker', () => {
    it('returns the updated worker record', async () => {
      const updated = makeWorker({ name: 'Updated', slug: 'updated' });
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([makeWorker()]))
            .mockReturnValueOnce(makeSelectChain([])),
          update: vi.fn().mockReturnValue(makeUpdateChain([updated])),
        });
        return fn(tx);
      });
      const result = await service.updateWorker('my-worker', { name: 'Updated' });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when worker does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });
      await expect(service.updateWorker('nonexistent', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with slug in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });
      await expect(service.updateWorker('missing-slug', { name: 'X' })).rejects.toThrow('missing-slug');
    });

    it('regenerates slug when name changes', async () => {
      const existing = makeWorker();
      const updated = makeWorker({ name: 'New Name', slug: 'new-name' });
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
      await service.updateWorker('my-worker', { name: 'New Name' });
      expect(capturedSet).toMatchObject({ slug: 'new-name' });
    });

    it('throws ConflictException when new slug already exists for a different worker', async () => {
      const existing = makeWorker();
      const collision = makeWorker({ id: 'other-uuid', slug: 'new-name' });
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))
            .mockReturnValueOnce(makeSelectChain([collision])),
        });
        return fn(tx);
      });
      await expect(service.updateWorker('my-worker', { name: 'New Name' })).rejects.toThrow(ConflictException);
    });

    it('includes the conflicting slug in the ConflictException message', async () => {
      const existing = makeWorker();
      const collision = makeWorker({ id: 'other-uuid', slug: 'new-name' });
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([existing]))
            .mockReturnValueOnce(makeSelectChain([collision])),
        });
        return fn(tx);
      });
      await expect(service.updateWorker('my-worker', { name: 'New Name' })).rejects.toThrow('new-name');
    });

    it('does not check slug collision when name is not in dto', async () => {
      const existing = makeWorker();
      const updated = makeWorker({ description: 'Changed' });
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
      await service.updateWorker('my-worker', { description: 'Changed' });
      expect(selectCallCount).toBe(1);
    });

    it('wraps update in a transaction', async () => {
      const existing = makeWorker();
      const updated = makeWorker();
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
      await service.updateWorker('my-worker', { name: 'New Name' });
      expect(mockDb.transaction).toHaveBeenCalledOnce();
    });
  });

  describe('deprecateVersion', () => {
    function makeDeprecateTx(
      workerResult: unknown,
      versionResult: unknown,
      updateResult?: unknown,
    ) {
      const tx = makeTx({
        select: vi.fn()
          .mockReturnValueOnce(makeSelectChain(workerResult))
          .mockReturnValueOnce(makeSelectChain(versionResult)),
        update: updateResult !== undefined
          ? vi.fn().mockReturnValue(makeUpdateChain(updateResult))
          : vi.fn(),
      });
      return tx;
    }

    it('returns the updated version with DEPRECATED status', async () => {
      const deprecated = makeVersion({ status: 'DEPRECATED' });
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        return fn(makeDeprecateTx([makeWorker()], [makeVersion()], [deprecated]));
      });
      const result = await service.deprecateVersion('my-worker', 1);
      expect(result.status).toBe('DEPRECATED');
    });

    it('throws NotFoundException when worker does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });
      await expect(service.deprecateVersion('nonexistent', 1)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with slug in message when worker not found', async () => {
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
        });
        return fn(tx);
      });
      await expect(service.deprecateVersion('missing-slug', 1)).rejects.toThrow('missing-slug');
    });

    it('throws NotFoundException when version does not exist for the worker', async () => {
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        return fn(makeDeprecateTx([makeWorker()], []));
      });
      await expect(service.deprecateVersion('my-worker', 99)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with version number in message when version not found', async () => {
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        return fn(makeDeprecateTx([makeWorker()], []));
      });
      await expect(service.deprecateVersion('my-worker', 99)).rejects.toThrow('99');
    });

    it('sets status to DEPRECATED in the update call', async () => {
      const deprecated = makeVersion({ status: 'DEPRECATED' });
      const { service, mockDb } = buildService();
      let capturedSet: Record<string, unknown> | null = null;
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const updateChain = {
          set: vi.fn().mockImplementation((v: Record<string, unknown>) => {
            capturedSet = v;
            return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([deprecated]) }) };
          }),
        };
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([makeWorker()]))
            .mockReturnValueOnce(makeSelectChain([makeVersion()])),
          update: vi.fn().mockReturnValue(updateChain),
        });
        return fn(tx);
      });
      await service.deprecateVersion('my-worker', 1);
      expect(capturedSet).toMatchObject({ status: 'DEPRECATED' });
    });

    it('does not throw if version is already DEPRECATED (idempotent)', async () => {
      const already = makeVersion({ status: 'DEPRECATED' });
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        return fn(makeDeprecateTx([makeWorker()], [already], [already]));
      });
      await expect(service.deprecateVersion('my-worker', 1)).resolves.toEqual(already);
    });

    it('does not call update when worker is not found', async () => {
      const { service, mockDb } = buildService();
      let txUpdate: any;
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn().mockReturnValueOnce(makeSelectChain([])),
          update: vi.fn(),
        });
        txUpdate = tx.update;
        return fn(tx);
      });
      await expect(service.deprecateVersion('missing', 1)).rejects.toThrow(NotFoundException);
      expect(txUpdate).not.toHaveBeenCalled();
    });

    it('does not call update when version is not found', async () => {
      const { service, mockDb } = buildService();
      let txUpdate: any;
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = makeTx({
          select: vi.fn()
            .mockReturnValueOnce(makeSelectChain([makeWorker()]))
            .mockReturnValueOnce(makeSelectChain([])),
          update: vi.fn(),
        });
        txUpdate = tx.update;
        return fn(tx);
      });
      await expect(service.deprecateVersion('my-worker', 99)).rejects.toThrow(NotFoundException);
      expect(txUpdate).not.toHaveBeenCalled();
    });

    it('wraps execution in a transaction', async () => {
      const deprecated = makeVersion({ status: 'DEPRECATED' });
      const { service, mockDb } = buildService();
      mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        return fn(makeDeprecateTx([makeWorker()], [makeVersion()], [deprecated]));
      });
      await service.deprecateVersion('my-worker', 1);
      expect(mockDb.transaction).toHaveBeenCalledOnce();
    });
  });
});
