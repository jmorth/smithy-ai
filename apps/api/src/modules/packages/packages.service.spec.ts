import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PackagesService } from './packages.service';
import type { CreatePackageDto } from './dto/create-package.dto';
import type { UpdatePackageDto } from './dto/update-package.dto';

// ── helpers ────────────────────────────────────────────────────────────────

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

function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-uuid-1',
    packageId: 'pkg-uuid-1',
    fileKey: 'packages/pkg-uuid-1/file.pdf',
    filename: 'file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ── DB mock factory ─────────────────────────────────────────────────────────

function makeSelectChain(resolveValue: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolveValue),
  };
}

function makeSelectCountChain(count: number) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count }]),
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

function makeSoftDeleteChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function buildService() {
  const mockDb = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    query: {
      packages: {
        findFirst: vi.fn(),
      },
    },
  };
  const service = new PackagesService(mockDb as any);
  return { service, mockDb };
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('PackagesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('inserts a new package with status PENDING and returns the record', async () => {
      const pkg = makePackage();
      const { service, mockDb } = buildService();
      mockDb.insert.mockReturnValue(makeInsertChain([pkg]));

      const dto: CreatePackageDto = { type: 'document' };
      const result = await service.create(dto);

      expect(mockDb.insert).toHaveBeenCalledOnce();
      expect(result).toEqual(pkg);
    });

    it('passes status PENDING regardless of dto', async () => {
      const pkg = makePackage();
      const { service, mockDb } = buildService();
      const insertChain = makeInsertChain([pkg]);
      mockDb.insert.mockReturnValue(insertChain);

      await service.create({ type: 'image' });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDING' }),
      );
    });

    it('sets metadata to empty object when dto.metadata is omitted', async () => {
      const pkg = makePackage();
      const { service, mockDb } = buildService();
      const insertChain = makeInsertChain([pkg]);
      mockDb.insert.mockReturnValue(insertChain);

      await service.create({ type: 'document' });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: {} }),
      );
    });

    it('passes provided metadata to insert', async () => {
      const pkg = makePackage({ metadata: { key: 'val' } });
      const { service, mockDb } = buildService();
      const insertChain = makeInsertChain([pkg]);
      mockDb.insert.mockReturnValue(insertChain);

      await service.create({ type: 'document', metadata: { key: 'val' } });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { key: 'val' } }),
      );
    });

    it('passes assemblyLineId when provided', async () => {
      const pkg = makePackage({ assemblyLineId: 'al-uuid' });
      const { service, mockDb } = buildService();
      const insertChain = makeInsertChain([pkg]);
      mockDb.insert.mockReturnValue(insertChain);

      await service.create({ type: 'document', assemblyLineId: 'al-uuid' });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ assemblyLineId: 'al-uuid' }),
      );
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns data and total with no filters', async () => {
      const pkgs = [makePackage({ id: 'a' }), makePackage({ id: 'b' })];
      const { service, mockDb } = buildService();
      mockDb.select
        .mockReturnValueOnce(makeSelectChain(pkgs))
        .mockReturnValueOnce(makeSelectCountChain(2));

      const result = await service.findAll({});

      expect(result.data).toEqual(pkgs);
      expect(result.total).toBe(2);
      expect(result.cursor).toBeUndefined();
    });

    it('defaults limit to 20 when not provided', async () => {
      const { service, mockDb } = buildService();
      const dataChain = makeSelectChain([]);
      mockDb.select
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeSelectCountChain(0));

      await service.findAll({});

      expect(dataChain.limit).toHaveBeenCalledWith(21); // limit + 1
    });

    it('caps limit at 100', async () => {
      const { service, mockDb } = buildService();
      const dataChain = makeSelectChain([]);
      mockDb.select
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeSelectCountChain(0));

      await service.findAll({ limit: 500 });

      expect(dataChain.limit).toHaveBeenCalledWith(101); // capped 100 + 1
    });

    it('returns cursor when more pages exist', async () => {
      // Return limit+1 rows to signal next page exists
      const pkgs = Array.from({ length: 21 }, (_, i) =>
        makePackage({ id: `id-${String(i).padStart(3, '0')}` }),
      );
      const { service, mockDb } = buildService();
      mockDb.select
        .mockReturnValueOnce(makeSelectChain(pkgs))
        .mockReturnValueOnce(makeSelectCountChain(50));

      const result = await service.findAll({ limit: 20 });

      expect(result.data).toHaveLength(20);
      expect(result.cursor).toBe('id-019');
    });

    it('returns no cursor on last page', async () => {
      const pkgs = [makePackage({ id: 'only' })];
      const { service, mockDb } = buildService();
      mockDb.select
        .mockReturnValueOnce(makeSelectChain(pkgs))
        .mockReturnValueOnce(makeSelectCountChain(1));

      const result = await service.findAll({ limit: 20 });

      expect(result.cursor).toBeUndefined();
    });

    it('filters by type', async () => {
      const { service, mockDb } = buildService();
      const dataChain = makeSelectChain([]);
      mockDb.select
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeSelectCountChain(0));

      await service.findAll({ type: 'document' });

      expect(dataChain.where).toHaveBeenCalledOnce();
    });

    it('filters by status', async () => {
      const { service, mockDb } = buildService();
      const dataChain = makeSelectChain([]);
      mockDb.select
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeSelectCountChain(0));

      await service.findAll({ status: 'COMPLETED' as any });

      expect(dataChain.where).toHaveBeenCalledOnce();
    });

    it('filters by assemblyLineId', async () => {
      const { service, mockDb } = buildService();
      const dataChain = makeSelectChain([]);
      mockDb.select
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeSelectCountChain(0));

      await service.findAll({ assemblyLineId: 'al-uuid' });

      expect(dataChain.where).toHaveBeenCalledOnce();
    });

    it('filters by createdAfter', async () => {
      const { service, mockDb } = buildService();
      const dataChain = makeSelectChain([]);
      mockDb.select
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeSelectCountChain(0));

      await service.findAll({ createdAfter: new Date('2024-01-01') });

      expect(dataChain.where).toHaveBeenCalledOnce();
    });

    it('filters by createdBefore', async () => {
      const { service, mockDb } = buildService();
      const dataChain = makeSelectChain([]);
      mockDb.select
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeSelectCountChain(0));

      await service.findAll({ createdBefore: new Date('2024-12-31') });

      expect(dataChain.where).toHaveBeenCalledOnce();
    });

    it('applies cursor for keyset pagination', async () => {
      const { service, mockDb } = buildService();
      const dataChain = makeSelectChain([]);
      mockDb.select
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeSelectCountChain(0));

      await service.findAll({ cursor: 'some-uuid' });

      expect(dataChain.where).toHaveBeenCalledOnce();
    });

    it('runs data and count queries in parallel', async () => {
      const callOrder: string[] = [];
      const { service, mockDb } = buildService();

      const dataChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          callOrder.push('data');
          return Promise.resolve([]);
        }),
      };
      const countChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          callOrder.push('count');
          return Promise.resolve([{ count: 0 }]);
        }),
      };
      mockDb.select
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(countChain);

      await service.findAll({});

      expect(callOrder).toContain('data');
      expect(callOrder).toContain('count');
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns the package with its files', async () => {
      const file = makeFile();
      const pkg = { ...makePackage(), files: [file] };
      const { service, mockDb } = buildService();
      mockDb.query.packages.findFirst.mockResolvedValue(pkg);

      const result = await service.findById('pkg-uuid-1');

      expect(result).toEqual(pkg);
      expect(result.files).toHaveLength(1);
    });

    it('returns package with empty files array when no files exist', async () => {
      const pkg = { ...makePackage(), files: [] };
      const { service, mockDb } = buildService();
      mockDb.query.packages.findFirst.mockResolvedValue(pkg);

      const result = await service.findById('pkg-uuid-1');

      expect(result.files).toEqual([]);
    });

    it('throws NotFoundException when package does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.query.packages.findFirst.mockResolvedValue(undefined);

      await expect(service.findById('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with id in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.query.packages.findFirst.mockResolvedValue(undefined);

      await expect(service.findById('bad-id')).rejects.toThrow('bad-id');
    });

    it('calls findFirst with files relation', async () => {
      const pkg = { ...makePackage(), files: [] };
      const { service, mockDb } = buildService();
      mockDb.query.packages.findFirst.mockResolvedValue(pkg);

      await service.findById('pkg-uuid-1');

      expect(mockDb.query.packages.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ with: { files: true } }),
      );
    });

    it('calls findFirst with where filtering deletedAt', async () => {
      const pkg = { ...makePackage(), files: [] };
      const { service, mockDb } = buildService();
      mockDb.query.packages.findFirst.mockResolvedValue(pkg);

      await service.findById('pkg-uuid-1');

      expect(mockDb.query.packages.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.anything() }),
      );
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('returns the updated package record', async () => {
      const updated = makePackage({ type: 'image', status: 'IN_TRANSIT' });
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));
      mockDb.update.mockReturnValue(makeUpdateChain([updated]));

      const dto: UpdatePackageDto = { type: 'image', status: 'IN_TRANSIT' as any };
      const result = await service.update('pkg-uuid-1', dto);

      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when package does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.update('missing', {})).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with id in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.update('missing-id', {})).rejects.toThrow('missing-id');
    });

    it('only sets fields that are present in the dto', async () => {
      const updated = makePackage({ type: 'image' });
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));
      const updateChain = makeUpdateChain([updated]);
      mockDb.update.mockReturnValue(updateChain);

      await service.update('pkg-uuid-1', { type: 'image' });

      const setCalls = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCalls).toHaveProperty('type', 'image');
      expect(setCalls).not.toHaveProperty('status');
      expect(setCalls).not.toHaveProperty('metadata');
    });

    it('updates metadata when provided', async () => {
      const updated = makePackage({ metadata: { foo: 'bar' } });
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));
      const updateChain = makeUpdateChain([updated]);
      mockDb.update.mockReturnValue(updateChain);

      await service.update('pkg-uuid-1', { metadata: { foo: 'bar' } });

      const setCalls = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCalls).toHaveProperty('metadata', { foo: 'bar' });
    });

    it('includes updatedAt in the SET clause', async () => {
      const updated = makePackage();
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));
      const updateChain = makeUpdateChain([updated]);
      mockDb.update.mockReturnValue(updateChain);

      await service.update('pkg-uuid-1', { type: 'new' });

      const setCalls = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCalls).toHaveProperty('updatedAt');
      expect(setCalls['updatedAt']).toBeInstanceOf(Date);
    });

    it('does not set deletedAt — that is for softDelete only', async () => {
      const updated = makePackage();
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));
      const updateChain = makeUpdateChain([updated]);
      mockDb.update.mockReturnValue(updateChain);

      await service.update('pkg-uuid-1', { type: 'new' });

      const setCalls = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCalls).not.toHaveProperty('deletedAt');
    });
  });

  // ── softDelete ───────────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('resolves without returning a value', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));
      mockDb.update.mockReturnValue(makeSoftDeleteChain());

      await expect(service.softDelete('pkg-uuid-1')).resolves.toBeUndefined();
    });

    it('sets deletedAt to a Date', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));
      const deleteChain = makeSoftDeleteChain();
      mockDb.update.mockReturnValue(deleteChain);

      await service.softDelete('pkg-uuid-1');

      const setCalls = deleteChain.set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCalls).toHaveProperty('deletedAt');
      expect(setCalls['deletedAt']).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when package does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with id in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.softDelete('bad-id')).rejects.toThrow('bad-id');
    });

    it('does not hard-delete the row', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));
      const deleteChain = makeSoftDeleteChain();
      mockDb.update.mockReturnValue(deleteChain);

      await service.softDelete('pkg-uuid-1');

      expect(mockDb.update).toHaveBeenCalledOnce();
    });
  });
});
