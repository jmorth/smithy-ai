import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';
import type { CreatePackageDto } from './dto/create-package.dto';
import type { UpdatePackageDto } from './dto/update-package.dto';
import type { PaginationQueryDto } from './dto/pagination-query.dto';
import type { PresignFileDto } from './dto/presign-file.dto';
import type { ConfirmFileDto } from './dto/confirm-file.dto';

// ── helpers ────────────────────────────────────────────────────────────────

function makePackage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
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
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    packageId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    fileKey: 'packages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/file.pdf',
    filename: 'file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeService() {
  return {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    createPresignedUpload: vi.fn(),
    confirmFileUpload: vi.fn(),
    listFiles: vi.fn(),
    deleteFile: vi.fn(),
  };
}

const PKG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const FILE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ── suite ──────────────────────────────────────────────────────────────────

describe('PackagesController', () => {
  let controller: PackagesController;
  let mockService: ReturnType<typeof makeService>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockService = makeService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PackagesController],
      providers: [
        {
          provide: PackagesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<PackagesController>(PackagesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('delegates to service.create and returns the result', async () => {
      const pkg = makePackage();
      const dto: CreatePackageDto = { type: 'document' };
      mockService.create.mockResolvedValue(pkg);

      const result = await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledOnce();
      expect(result).toEqual(pkg);
    });

    it('passes the full dto to service.create', async () => {
      const pkg = makePackage({ assemblyLineId: 'al-uuid', metadata: { key: 'val' } });
      const dto: CreatePackageDto = { type: 'document', metadata: { key: 'val' }, assemblyLineId: 'al-uuid' };
      mockService.create.mockResolvedValue(pkg);

      await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to service.findAll and returns the result', async () => {
      const paginationResult = { data: [makePackage()], total: 1, cursor: undefined };
      const query = { limit: 20 } as PaginationQueryDto;
      mockService.findAll.mockResolvedValue(paginationResult);

      const result = await controller.findAll(query);

      expect(mockService.findAll).toHaveBeenCalledOnce();
      expect(result).toEqual(paginationResult);
    });

    it('passes query params including cursor to service.findAll', async () => {
      const paginationResult = { data: [], total: 0, cursor: undefined };
      const query = { limit: 10, cursor: 'some-cursor', type: 'image' } as PaginationQueryDto;
      mockService.findAll.mockResolvedValue(paginationResult);

      await controller.findAll(query);

      expect(mockService.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('delegates to service.findById and returns the result with files', async () => {
      const pkg = { ...makePackage(), files: [makeFile()] };
      mockService.findById.mockResolvedValue(pkg);

      const result = await controller.findById(PKG_ID);

      expect(mockService.findById).toHaveBeenCalledOnce();
      expect(result).toEqual(pkg);
      expect((result as any).files).toHaveLength(1);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.findById.mockRejectedValue(new NotFoundException(`Package ${PKG_ID} not found`));

      await expect(controller.findById(PKG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('delegates to service.update and returns the result', async () => {
      const updated = makePackage({ type: 'image' });
      const dto: UpdatePackageDto = { type: 'image' };
      mockService.update.mockResolvedValue(updated);

      const result = await controller.update(PKG_ID, dto);

      expect(mockService.update).toHaveBeenCalledOnce();
      expect(result).toEqual(updated);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.update.mockRejectedValue(new NotFoundException(`Package ${PKG_ID} not found`));

      await expect(controller.update(PKG_ID, {})).rejects.toThrow(NotFoundException);
    });

    it('propagates BadRequestException from service', async () => {
      mockService.update.mockRejectedValue(
        new BadRequestException('Invalid status transition from COMPLETED to PENDING'),
      );

      await expect(controller.update(PKG_ID, { status: 'PENDING' as any })).rejects.toThrow(BadRequestException);
    });
  });

  // ── softDelete ────────────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('delegates to service.softDelete', async () => {
      mockService.softDelete.mockResolvedValue(undefined);

      await controller.softDelete(PKG_ID);

      expect(mockService.softDelete).toHaveBeenCalledWith(PKG_ID);
    });

    it('resolves to void', async () => {
      mockService.softDelete.mockResolvedValue(undefined);

      const result = await controller.softDelete(PKG_ID);

      expect(result).toBeUndefined();
    });

    it('propagates NotFoundException from service', async () => {
      mockService.softDelete.mockRejectedValue(new NotFoundException(`Package ${PKG_ID} not found`));

      await expect(controller.softDelete(PKG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── presignUpload ─────────────────────────────────────────────────────────

  describe('presignUpload', () => {
    const presignDto: PresignFileDto = { filename: 'report.pdf', contentType: 'application/pdf' };

    it('delegates to service.createPresignedUpload and returns the result', async () => {
      const presignResult = { uploadUrl: 'https://s3.example.com/presigned', fileKey: 'packages/abc/report.pdf' };
      mockService.createPresignedUpload.mockResolvedValue(presignResult);

      const result = await controller.presignUpload(PKG_ID, presignDto);

      expect(mockService.createPresignedUpload).toHaveBeenCalledWith(PKG_ID, presignDto);
      expect(result).toEqual(presignResult);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.createPresignedUpload.mockRejectedValue(new NotFoundException(`Package ${PKG_ID} not found`));

      await expect(controller.presignUpload(PKG_ID, presignDto)).rejects.toThrow(NotFoundException);
    });
  });

  // ── confirmUpload ─────────────────────────────────────────────────────────

  describe('confirmUpload', () => {
    const confirmDto: ConfirmFileDto = {
      fileKey: 'packages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/uuid/doc.pdf',
      filename: 'doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    };

    it('delegates to service.confirmFileUpload and returns the file record', async () => {
      const file = makeFile();
      mockService.confirmFileUpload.mockResolvedValue(file);

      const result = await controller.confirmUpload(PKG_ID, confirmDto);

      expect(mockService.confirmFileUpload).toHaveBeenCalledWith(PKG_ID, confirmDto);
      expect(result).toEqual(file);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.confirmFileUpload.mockRejectedValue(new NotFoundException(`Package ${PKG_ID} not found`));

      await expect(controller.confirmUpload(PKG_ID, confirmDto)).rejects.toThrow(NotFoundException);
    });
  });

  // ── listFiles ─────────────────────────────────────────────────────────────

  describe('listFiles', () => {
    it('delegates to service.listFiles and returns the result', async () => {
      const files = [makeFile({ id: FILE_ID })];
      mockService.listFiles.mockResolvedValue(files);

      const result = await controller.listFiles(PKG_ID);

      expect(mockService.listFiles).toHaveBeenCalledWith(PKG_ID);
      expect(result).toEqual(files);
    });

    it('returns an empty array when no files exist', async () => {
      mockService.listFiles.mockResolvedValue([]);

      const result = await controller.listFiles(PKG_ID);

      expect(result).toEqual([]);
    });
  });

  // ── deleteFile ────────────────────────────────────────────────────────────

  describe('deleteFile', () => {
    it('delegates to service.deleteFile', async () => {
      mockService.deleteFile.mockResolvedValue(undefined);

      await controller.deleteFile(PKG_ID, FILE_ID);

      expect(mockService.deleteFile).toHaveBeenCalledWith(PKG_ID, FILE_ID);
    });

    it('resolves to void', async () => {
      mockService.deleteFile.mockResolvedValue(undefined);

      const result = await controller.deleteFile(PKG_ID, FILE_ID);

      expect(result).toBeUndefined();
    });

    it('propagates NotFoundException from service', async () => {
      mockService.deleteFile.mockRejectedValue(new NotFoundException(`File ${FILE_ID} not found`));

      await expect(controller.deleteFile(PKG_ID, FILE_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
