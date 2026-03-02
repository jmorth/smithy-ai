import { Injectable, Inject, ConflictException, NotFoundException } from '@nestjs/common';
import { and, desc, eq, max } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import type { DrizzleClient } from '../../database/database.provider';
import { workers, workerVersions } from '../../database/schema';
import { generateSlug } from '../../common/slug.util';
import type { CreateWorkerDto } from './dto/create-worker.dto';
import type { UpdateWorkerDto } from './dto/update-worker.dto';
import type { CreateWorkerVersionDto } from './dto/create-worker-version.dto';

export type WorkerRecord = typeof workers.$inferSelect;
export type WorkerVersionRecord = typeof workerVersions.$inferSelect;
export type WorkerWithVersions = WorkerRecord & { versions: WorkerVersionRecord[] };

@Injectable()
export class WorkersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  async createWorker(dto: CreateWorkerDto): Promise<WorkerRecord> {
    const slug = generateSlug(dto.name);

    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: workers.id })
        .from(workers)
        .where(eq(workers.slug, slug))
        .limit(1);

      if (existing) {
        throw new ConflictException(`Worker with slug "${slug}" already exists`);
      }

      const [worker] = await tx
        .insert(workers)
        .values({ name: dto.name, slug, description: dto.description })
        .returning();

      return worker!;
    });
  }

  async createVersion(slug: string, dto: CreateWorkerVersionDto): Promise<WorkerVersionRecord> {
    return this.db.transaction(async (tx) => {
      const [worker] = await tx
        .select({ id: workers.id })
        .from(workers)
        .where(eq(workers.slug, slug))
        .limit(1);

      if (!worker) {
        throw new NotFoundException(`Worker "${slug}" not found`);
      }

      const [maxRow] = await tx
        .select({ max: max(workerVersions.version) })
        .from(workerVersions)
        .where(eq(workerVersions.workerId, worker.id))
        .limit(1);

      const nextVersion = (maxRow?.max ?? 0) + 1;

      const [version] = await tx
        .insert(workerVersions)
        .values({
          workerId: worker.id,
          version: nextVersion,
          yamlConfig: dto.yamlConfig,
          dockerfileHash: dto.dockerfile ?? null,
        })
        .returning();

      return version!;
    });
  }

  async findAll(): Promise<WorkerWithVersions[]> {
    return this.db.query.workers.findMany({
      with: {
        versions: {
          orderBy: [desc(workerVersions.version)],
          limit: 1,
        },
      },
    }) as unknown as WorkerWithVersions[];
  }

  async findBySlug(slug: string): Promise<WorkerWithVersions> {
    const worker = await this.db.query.workers.findFirst({
      where: eq(workers.slug, slug),
      with: { versions: true },
    });

    if (!worker) {
      throw new NotFoundException(`Worker "${slug}" not found`);
    }

    return worker as WorkerWithVersions;
  }

  async updateWorker(slug: string, dto: UpdateWorkerDto): Promise<WorkerRecord> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: workers.id, name: workers.name, slug: workers.slug })
        .from(workers)
        .where(eq(workers.slug, slug))
        .limit(1);

      if (!existing) {
        throw new NotFoundException(`Worker "${slug}" not found`);
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (dto.name !== undefined) {
        updates['name'] = dto.name;
        const newSlug = generateSlug(dto.name);

        if (newSlug !== existing.slug) {
          const [collision] = await tx
            .select({ id: workers.id })
            .from(workers)
            .where(eq(workers.slug, newSlug))
            .limit(1);

          if (collision) {
            throw new ConflictException(`Worker with slug "${newSlug}" already exists`);
          }
        }

        updates['slug'] = newSlug;
      }

      if (dto.description !== undefined) {
        updates['description'] = dto.description;
      }

      const [updated] = await tx
        .update(workers)
        .set(updates as any)
        .where(eq(workers.id, existing.id))
        .returning();

      return updated!;
    });
  }

  async findVersion(slug: string, version: number): Promise<WorkerVersionRecord> {
    const [worker] = await this.db
      .select({ id: workers.id })
      .from(workers)
      .where(eq(workers.slug, slug))
      .limit(1);

    if (!worker) {
      throw new NotFoundException(`Worker "${slug}" not found`);
    }

    const [versionRow] = await this.db
      .select()
      .from(workerVersions)
      .where(and(eq(workerVersions.workerId, worker.id), eq(workerVersions.version, version)))
      .limit(1);

    if (!versionRow) {
      throw new NotFoundException(`Version ${version} not found for worker "${slug}"`);
    }

    return versionRow;
  }

  async deprecateVersion(slug: string, version: number): Promise<WorkerVersionRecord> {
    return this.db.transaction(async (tx) => {
      const [worker] = await tx
        .select({ id: workers.id })
        .from(workers)
        .where(eq(workers.slug, slug))
        .limit(1);

      if (!worker) {
        throw new NotFoundException(`Worker "${slug}" not found`);
      }

      const [versionRow] = await tx
        .select()
        .from(workerVersions)
        .where(and(eq(workerVersions.workerId, worker.id), eq(workerVersions.version, version)))
        .limit(1);

      if (!versionRow) {
        throw new NotFoundException(`Version ${version} not found for worker "${slug}"`);
      }

      const [updated] = await tx
        .update(workerVersions)
        .set({ status: 'DEPRECATED' })
        .where(eq(workerVersions.id, versionRow.id))
        .returning();

      return updated!;
    });
  }
}
