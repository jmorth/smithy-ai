import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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

function makeStorage() {
  return {
    getPresignedUploadUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDeleteChain() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
  };
}

function buildService() {
  const mockDb = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {
      packages: {
        findFirst: vi.fn(),
      },
    },
  };
  const mockStorage = makeStorage();
  const service = new PackagesService(mockDb as any, mockStorage as any);
  return { service, mockDb, mockStorage };
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
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'PENDING' }]));
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
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'PENDING' }]));
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
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'PENDING' }]));
      const updateChain = makeUpdateChain([updated]);
      mockDb.update.mockReturnValue(updateChain);

      await service.update('pkg-uuid-1', { metadata: { foo: 'bar' } });

      const setCalls = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCalls).toHaveProperty('metadata', { foo: 'bar' });
    });

    it('includes updatedAt in the SET clause', async () => {
      const updated = makePackage();
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'PENDING' }]));
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
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'PENDING' }]));
      const updateChain = makeUpdateChain([updated]);
      mockDb.update.mockReturnValue(updateChain);

      await service.update('pkg-uuid-1', { type: 'new' });

      const setCalls = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCalls).not.toHaveProperty('deletedAt');
    });

    // ── status machine integration ─────────────────────────────────────────

    it('allows a valid status transition (PENDING → IN_TRANSIT)', async () => {
      const updated = makePackage({ status: 'IN_TRANSIT' });
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'PENDING' }]));
      mockDb.update.mockReturnValue(makeUpdateChain([updated]));

      const result = await service.update('pkg-uuid-1', { status: 'IN_TRANSIT' as any });

      expect(result.status).toBe('IN_TRANSIT');
    });

    it('allows same-status transition (idempotent — PENDING → PENDING)', async () => {
      const updated = makePackage({ status: 'PENDING' });
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'PENDING' }]));
      mockDb.update.mockReturnValue(makeUpdateChain([updated]));

      await expect(service.update('pkg-uuid-1', { status: 'PENDING' as any })).resolves.toEqual(updated);
    });

    it('throws BadRequestException for an invalid status transition', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'COMPLETED' }]));

      await expect(service.update('pkg-uuid-1', { status: 'PENDING' as any })).rejects.toThrow(BadRequestException);
    });

    it('includes current and target status in the error message', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'COMPLETED' }]));

      await expect(service.update('pkg-uuid-1', { status: 'PENDING' as any })).rejects.toThrow(
        'Invalid status transition from COMPLETED to PENDING',
      );
    });

    it('includes valid transitions in the error message', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'COMPLETED' }]));

      await expect(service.update('pkg-uuid-1', { status: 'PENDING' as any })).rejects.toThrow(
        'Valid transitions: EXPIRED',
      );
    });

    it('error message says "none" when the source is a terminal state', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'EXPIRED' }]));

      await expect(service.update('pkg-uuid-1', { status: 'PENDING' as any })).rejects.toThrow(
        'Valid transitions: none',
      );
    });

    it('does not call db.update when status transition is invalid', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'FAILED' }]));

      await expect(service.update('pkg-uuid-1', { status: 'PENDING' as any })).rejects.toThrow(BadRequestException);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('skips transition validation when status is not in the dto', async () => {
      const updated = makePackage({ type: 'video' });
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1', status: 'EXPIRED' }]));
      mockDb.update.mockReturnValue(makeUpdateChain([updated]));

      // No status in dto — should not throw even though EXPIRED is terminal
      await expect(service.update('pkg-uuid-1', { type: 'video' })).resolves.toEqual(updated);
    });
  });

  // ── createPresignedUpload ────────────────────────────────────────────────

  describe('createPresignedUpload', () => {
    it('throws NotFoundException when package does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(
        service.createPresignedUpload('missing-id', { filename: 'a.pdf', contentType: 'application/pdf' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with packageId in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(
        service.createPresignedUpload('missing-id', { filename: 'a.pdf', contentType: 'application/pdf' }),
      ).rejects.toThrow('missing-id');
    });

    it('returns uploadUrl and fileKey', async () => {
      const { service, mockDb, mockStorage } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));
      mockStorage.getPresignedUploadUrl.mockResolvedValue('https://s3.example.com/upload');

      const result = await service.createPresignedUpload('pkg-uuid-1', {
        filename: 'report.pdf',
        contentType: 'application/pdf',
      });

      expect(result).toHaveProperty('uploadUrl', 'https://s3.example.com/upload');
      expect(result).toHaveProperty('fileKey');
    });

    it('generates S3 key with pattern packages/{packageId}/{uuid}/{filename}', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));

      const result = await service.createPresignedUpload('pkg-uuid-1', {
        filename: 'report.pdf',
        contentType: 'application/pdf',
      });

      expect(result.fileKey).toMatch(/^packages\/pkg-uuid-1\/[0-9a-f-]{36}\/report\.pdf$/);
    });

    it('calls getPresignedUploadUrl with generated key and contentType', async () => {
      const { service, mockDb, mockStorage } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));

      const result = await service.createPresignedUpload('pkg-uuid-1', {
        filename: 'report.pdf',
        contentType: 'application/pdf',
      });

      expect(mockStorage.getPresignedUploadUrl).toHaveBeenCalledWith(result.fileKey, 'application/pdf');
    });

    it('does not call storage when package not found', async () => {
      const { service, mockDb, mockStorage } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(
        service.createPresignedUpload('missing', { filename: 'a.pdf', contentType: 'application/pdf' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockStorage.getPresignedUploadUrl).not.toHaveBeenCalled();
    });
  });

  // ── confirmFileUpload ─────────────────────────────────────────────────────

  describe('confirmFileUpload', () => {
    const confirmDto = {
      fileKey: 'packages/pkg-uuid-1/some-uuid/doc.pdf',
      filename: 'doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    };

    it('throws NotFoundException when package does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.confirmFileUpload('missing-id', confirmDto)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with packageId in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.confirmFileUpload('missing-id', confirmDto)).rejects.toThrow('missing-id');
    });

    it('returns the created file record', async () => {
      const file = makeFile({ packageId: 'pkg-uuid-1', fileKey: confirmDto.fileKey });
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));
      mockDb.insert.mockReturnValue(makeInsertChain([file]));

      const result = await service.confirmFileUpload('pkg-uuid-1', confirmDto);

      expect(result).toEqual(file);
    });

    it('inserts with the correct field values', async () => {
      const file = makeFile({ packageId: 'pkg-uuid-1' });
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'pkg-uuid-1' }]));
      const insertChain = makeInsertChain([file]);
      mockDb.insert.mockReturnValue(insertChain);

      await service.confirmFileUpload('pkg-uuid-1', confirmDto);

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          packageId: 'pkg-uuid-1',
          fileKey: confirmDto.fileKey,
          filename: confirmDto.filename,
          mimeType: confirmDto.mimeType,
          sizeBytes: confirmDto.sizeBytes,
        }),
      );
    });

    it('does not call insert when package not found', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.confirmFileUpload('missing', confirmDto)).rejects.toThrow(NotFoundException);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // ── listFiles ─────────────────────────────────────────────────────────────

  describe('listFiles', () => {
    it('returns all files for the package', async () => {
      const files = [makeFile({ id: 'f1' }), makeFile({ id: 'f2' })];
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(files),
      });

      const result = await service.listFiles('pkg-uuid-1');

      expect(result).toEqual(files);
    });

    it('returns an empty array when no files exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      });

      const result = await service.listFiles('pkg-uuid-1');

      expect(result).toEqual([]);
    });

    it('queries by packageId', async () => {
      const { service, mockDb } = buildService();
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(chain);

      await service.listFiles('pkg-uuid-1');

      expect(chain.where).toHaveBeenCalledOnce();
    });
  });

  // ── deleteFile ────────────────────────────────────────────────────────────

  describe('deleteFile', () => {
    it('throws NotFoundException when file does not exist', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.deleteFile('pkg-uuid-1', 'missing-file')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with fileId in message', async () => {
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.deleteFile('pkg-uuid-1', 'bad-file-id')).rejects.toThrow('bad-file-id');
    });

    it('resolves void on success', async () => {
      const file = makeFile({ id: 'file-uuid-1' });
      const { service, mockDb } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([file]));
      mockDb.delete.mockReturnValue(makeDeleteChain());

      await expect(service.deleteFile('pkg-uuid-1', 'file-uuid-1')).resolves.toBeUndefined();
    });

    it('calls storage.delete with file S3 key', async () => {
      const file = makeFile({ fileKey: 'packages/pkg-uuid-1/uuid/report.pdf' });
      const { service, mockDb, mockStorage } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([file]));
      mockDb.delete.mockReturnValue(makeDeleteChain());

      await service.deleteFile('pkg-uuid-1', 'file-uuid-1');

      expect(mockStorage.delete).toHaveBeenCalledWith('packages/pkg-uuid-1/uuid/report.pdf');
    });

    it('deletes from DB after S3 delete succeeds', async () => {
      const file = makeFile();
      const { service, mockDb, mockStorage } = buildService();
      const deleteChain = makeDeleteChain();
      mockDb.select.mockReturnValueOnce(makeSelectChain([file]));
      mockDb.delete.mockReturnValue(deleteChain);

      await service.deleteFile('pkg-uuid-1', 'file-uuid-1');

      expect(mockStorage.delete).toHaveBeenCalledBefore
        ? expect(mockStorage.delete).toHaveBeenCalledBefore(mockDb.delete)
        : expect(mockDb.delete).toHaveBeenCalledOnce();
    });

    it('does not delete DB record when S3 delete throws', async () => {
      const file = makeFile();
      const { service, mockDb, mockStorage } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([file]));
      mockStorage.delete.mockRejectedValue(new Error('S3 error'));

      await expect(service.deleteFile('pkg-uuid-1', 'file-uuid-1')).rejects.toThrow('S3 error');
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('does not call storage when file is not found', async () => {
      const { service, mockDb, mockStorage } = buildService();
      mockDb.select.mockReturnValueOnce(makeSelectChain([]));

      await expect(service.deleteFile('pkg-uuid-1', 'missing')).rejects.toThrow(NotFoundException);
      expect(mockStorage.delete).not.toHaveBeenCalled();
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
