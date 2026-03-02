import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, eq, gt, gte, isNull, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { PackageStatus } from '@smithy/shared';
import { DRIZZLE } from '../../database/database.constants';
import type { DrizzleClient } from '../../database/database.provider';
import { packages, packageFiles } from '../../database/schema';
import { StorageService } from '../storage/storage.service';
import type { CreatePackageDto } from './dto/create-package.dto';
import type { UpdatePackageDto } from './dto/update-package.dto';
import type { PresignFileDto } from './dto/presign-file.dto';
import type { ConfirmFileDto } from './dto/confirm-file.dto';
import { PackageStatusMachine } from './package-status.machine';

export type PackageRecord = typeof packages.$inferSelect;
export type PackageFileRecord = typeof packageFiles.$inferSelect;
export type PackageWithFiles = PackageRecord & { files: PackageFileRecord[] };

export interface PaginationQuery {
  cursor?: string;
  limit?: number;
  type?: string;
  status?: string;
  assemblyLineId?: string;
  createdAfter?: Date | string;
  createdBefore?: Date | string;
}

export interface PaginationResult {
  data: PackageRecord[];
  cursor?: string;
  total: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class PackagesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    private readonly storage: StorageService,
  ) {}

  async create(dto: CreatePackageDto): Promise<PackageRecord> {
    const [pkg] = await this.db
      .insert(packages)
      .values({
        type: dto.type,
        metadata: dto.metadata ?? {},
        assemblyLineId: dto.assemblyLineId,
        status: 'PENDING',
      })
      .returning();
    return pkg!;
  }

  async findAll(query: PaginationQuery): Promise<PaginationResult> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    // Base conditions (no cursor) — used for count and as the foundation for data
    const baseConditions = [isNull(packages.deletedAt)];
    if (query.type) baseConditions.push(eq(packages.type, query.type));
    if (query.status) baseConditions.push(eq(packages.status, query.status as any));
    if (query.assemblyLineId) baseConditions.push(eq(packages.assemblyLineId, query.assemblyLineId));
    if (query.createdAfter) baseConditions.push(gte(packages.createdAt, new Date(query.createdAfter)));
    if (query.createdBefore) baseConditions.push(lte(packages.createdAt, new Date(query.createdBefore)));

    // Data conditions add cursor for keyset pagination
    const dataConditions = query.cursor
      ? [...baseConditions, gt(packages.id, query.cursor)]
      : baseConditions;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(packages)
        .where(and(...dataConditions))
        .orderBy(packages.id)
        .limit(limit + 1),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(packages)
        .where(and(...baseConditions)),
    ]);

    const hasNextPage = rows.length > limit;
    const data = hasNextPage ? rows.slice(0, limit) : rows;

    return {
      data,
      cursor: hasNextPage ? data[data.length - 1]!.id : undefined,
      total: (countResult as Array<{ count: number }>)[0]!.count,
    };
  }

  async findById(id: string): Promise<PackageWithFiles> {
    const pkg = await this.db.query.packages.findFirst({
      where: and(eq(packages.id, id), isNull(packages.deletedAt)),
      with: { files: true },
    });

    if (!pkg) {
      throw new NotFoundException(`Package ${id} not found`);
    }

    return pkg as PackageWithFiles;
  }

  async update(id: string, dto: UpdatePackageDto): Promise<PackageRecord> {
    const existing = await this.db
      .select({ id: packages.id, status: packages.status })
      .from(packages)
      .where(and(eq(packages.id, id), isNull(packages.deletedAt)))
      .limit(1);

    if (!existing.length) {
      throw new NotFoundException(`Package ${id} not found`);
    }

    if (dto.status !== undefined) {
      const current = existing[0]!.status as PackageStatus;
      const target = dto.status as PackageStatus;
      if (!PackageStatusMachine.isValidTransition(current, target)) {
        const valid = PackageStatusMachine.getValidTransitions(current);
        throw new BadRequestException(
          `Invalid status transition from ${current} to ${target}. Valid transitions: ${valid.join(', ') || 'none'}`,
        );
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.type !== undefined) updates['type'] = dto.type;
    if (dto.metadata !== undefined) updates['metadata'] = dto.metadata;
    if (dto.status !== undefined) updates['status'] = dto.status;

    const [updated] = await this.db
      .update(packages)
      .set(updates as any)
      .where(eq(packages.id, id))
      .returning();

    return updated!;
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.db
      .select({ id: packages.id })
      .from(packages)
      .where(and(eq(packages.id, id), isNull(packages.deletedAt)))
      .limit(1);

    if (!existing.length) {
      throw new NotFoundException(`Package ${id} not found`);
    }

    await this.db
      .update(packages)
      .set({ deletedAt: new Date() })
      .where(eq(packages.id, id));
  }

  async createPresignedUpload(
    packageId: string,
    dto: PresignFileDto,
  ): Promise<{ uploadUrl: string; fileKey: string }> {
    const exists = await this.db
      .select({ id: packages.id })
      .from(packages)
      .where(and(eq(packages.id, packageId), isNull(packages.deletedAt)))
      .limit(1);

    if (!exists.length) {
      throw new NotFoundException(`Package ${packageId} not found`);
    }

    const fileKey = `packages/${packageId}/${randomUUID()}/${dto.filename}`;
    const uploadUrl = await this.storage.getPresignedUploadUrl(fileKey, dto.contentType);
    return { uploadUrl, fileKey };
  }

  async confirmFileUpload(packageId: string, dto: ConfirmFileDto): Promise<PackageFileRecord> {
    const exists = await this.db
      .select({ id: packages.id })
      .from(packages)
      .where(and(eq(packages.id, packageId), isNull(packages.deletedAt)))
      .limit(1);

    if (!exists.length) {
      throw new NotFoundException(`Package ${packageId} not found`);
    }

    const [file] = await this.db
      .insert(packageFiles)
      .values({
        packageId,
        fileKey: dto.fileKey,
        filename: dto.filename,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
      })
      .returning();

    return file!;
  }

  async listFiles(packageId: string): Promise<PackageFileRecord[]> {
    return this.db
      .select()
      .from(packageFiles)
      .where(eq(packageFiles.packageId, packageId));
  }

  async deleteFile(packageId: string, fileId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(packageFiles)
      .where(and(eq(packageFiles.id, fileId), eq(packageFiles.packageId, packageId)))
      .limit(1);

    if (!rows.length) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    await this.storage.delete(rows[0]!.fileKey);

    await this.db.delete(packageFiles).where(eq(packageFiles.id, fileId));
  }
}
