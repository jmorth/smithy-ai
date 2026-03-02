import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { and, count, eq, inArray, ne } from 'drizzle-orm';
import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleClient } from '../../../database/database.provider';
import {
  workerPools,
  workerPoolMembers,
  workerVersions,
  workers,
  packages,
} from '../../../database/schema';
import { generateSlug } from '../../../common/slug.util';
import type { CreateWorkerPoolDto } from './dto/create-worker-pool.dto';
import type { UpdateWorkerPoolDto } from './dto/update-worker-pool.dto';

export type WorkerPoolRecord = typeof workerPools.$inferSelect;
export type WorkerPoolMemberRecord = typeof workerPoolMembers.$inferSelect;
export type PackageRecord = typeof packages.$inferSelect;

export type WorkerPoolMemberDetail = WorkerPoolMemberRecord & {
  workerName: string;
  workerVersionNumber: number;
};

export type WorkerPoolWithMemberCount = WorkerPoolRecord & {
  memberCount: number;
};

export type WorkerPoolWithMembers = WorkerPoolRecord & {
  members: WorkerPoolMemberDetail[];
  queueDepth: null;
};

export type SubmitToPoolDto = {
  type: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
};

@Injectable()
export class WorkerPoolsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  async create(dto: CreateWorkerPoolDto): Promise<WorkerPoolRecord> {
    const slug = generateSlug(dto.name);

    return this.db.transaction(async (tx) => {
      // Check slug uniqueness
      const [existing] = await tx
        .select({ id: workerPools.id })
        .from(workerPools)
        .where(eq(workerPools.slug, slug))
        .limit(1);

      if (existing) {
        throw new ConflictException(`Worker pool with slug "${slug}" already exists`);
      }

      // Validate all workerVersionIds exist and are not DEPRECATED
      const workerVersionIds = dto.members.map((m) => m.workerVersionId);
      const foundVersions = await tx
        .select({ id: workerVersions.id, status: workerVersions.status })
        .from(workerVersions)
        .where(inArray(workerVersions.id, workerVersionIds));

      if (foundVersions.length !== workerVersionIds.length) {
        const foundIds = new Set(foundVersions.map((v) => v.id));
        const missing = workerVersionIds.find((id) => !foundIds.has(id));
        throw new BadRequestException(`Worker version "${missing}" does not exist`);
      }

      const deprecated = foundVersions.find((v) => v.status === 'DEPRECATED');
      if (deprecated) {
        throw new BadRequestException(
          `Worker version "${deprecated.id}" is DEPRECATED and cannot be used`,
        );
      }

      // Insert pool
      const [pool] = await tx
        .insert(workerPools)
        .values({ name: dto.name, slug, maxConcurrency: dto.maxConcurrency })
        .returning();

      // Insert members with default priority 1
      const memberValues = dto.members.map((member) => ({
        poolId: pool!.id,
        workerVersionId: member.workerVersionId,
        priority: member.priority ?? 1,
      }));

      await tx.insert(workerPoolMembers).values(memberValues);

      return pool!;
    });
  }

  async findAll(): Promise<WorkerPoolWithMemberCount[]> {
    const rows = await this.db
      .select({
        id: workerPools.id,
        name: workerPools.name,
        slug: workerPools.slug,
        description: workerPools.description,
        status: workerPools.status,
        maxConcurrency: workerPools.maxConcurrency,
        createdAt: workerPools.createdAt,
        updatedAt: workerPools.updatedAt,
        memberCount: count(workerPoolMembers.id),
      })
      .from(workerPools)
      .leftJoin(workerPoolMembers, eq(workerPoolMembers.poolId, workerPools.id))
      .groupBy(workerPools.id);

    return rows as WorkerPoolWithMemberCount[];
  }

  async findBySlug(slug: string): Promise<WorkerPoolWithMembers> {
    const [pool] = await this.db
      .select()
      .from(workerPools)
      .where(eq(workerPools.slug, slug))
      .limit(1);

    if (!pool) {
      throw new NotFoundException(`Worker pool "${slug}" not found`);
    }

    const members = await this.db
      .select({
        id: workerPoolMembers.id,
        poolId: workerPoolMembers.poolId,
        workerVersionId: workerPoolMembers.workerVersionId,
        priority: workerPoolMembers.priority,
        workerName: workers.name,
        workerVersionNumber: workerVersions.version,
      })
      .from(workerPoolMembers)
      .innerJoin(workerVersions, eq(workerVersions.id, workerPoolMembers.workerVersionId))
      .innerJoin(workers, eq(workers.id, workerVersions.workerId))
      .where(eq(workerPoolMembers.poolId, pool.id));

    // TODO: queue depth from RabbitMQ/Redis when event bus (task 067) is available
    return { ...pool, members: members as WorkerPoolMemberDetail[], queueDepth: null };
  }

  async update(slug: string, dto: UpdateWorkerPoolDto): Promise<WorkerPoolRecord> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: workerPools.id, slug: workerPools.slug })
        .from(workerPools)
        .where(eq(workerPools.slug, slug))
        .limit(1);

      if (!existing) {
        throw new NotFoundException(`Worker pool "${slug}" not found`);
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (dto.name !== undefined) {
        updates['name'] = dto.name;
        const newSlug = generateSlug(dto.name);

        if (newSlug !== existing.slug) {
          const [collision] = await tx
            .select({ id: workerPools.id })
            .from(workerPools)
            .where(eq(workerPools.slug, newSlug))
            .limit(1);

          if (collision) {
            throw new ConflictException(`Worker pool with slug "${newSlug}" already exists`);
          }
        }

        updates['slug'] = newSlug;
      }

      if (dto.maxConcurrency !== undefined) {
        updates['maxConcurrency'] = dto.maxConcurrency;
      }

      // Replace all members if provided
      if (dto.members !== undefined) {
        const workerVersionIds = dto.members.map((m) => m.workerVersionId);
        const foundVersions = await tx
          .select({ id: workerVersions.id, status: workerVersions.status })
          .from(workerVersions)
          .where(inArray(workerVersions.id, workerVersionIds));

        if (foundVersions.length !== workerVersionIds.length) {
          const foundIds = new Set(foundVersions.map((v) => v.id));
          const missing = workerVersionIds.find((id) => !foundIds.has(id));
          throw new BadRequestException(`Worker version "${missing}" does not exist`);
        }

        const deprecated = foundVersions.find((v) => v.status === 'DEPRECATED');
        if (deprecated) {
          throw new BadRequestException(
            `Worker version "${deprecated.id}" is DEPRECATED and cannot be used`,
          );
        }

        await tx.delete(workerPoolMembers).where(eq(workerPoolMembers.poolId, existing.id));

        const memberValues = dto.members.map((member) => ({
          poolId: existing.id,
          workerVersionId: member.workerVersionId,
          priority: member.priority ?? 1,
        }));

        await tx.insert(workerPoolMembers).values(memberValues);
      }

      const [updated] = await tx
        .update(workerPools)
        .set(updates as any)
        .where(eq(workerPools.id, existing.id))
        .returning();

      return updated!;
    });
  }

  async archive(slug: string): Promise<WorkerPoolRecord> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: workerPools.id })
        .from(workerPools)
        .where(and(eq(workerPools.slug, slug), ne(workerPools.status, 'ARCHIVED')))
        .limit(1);

      if (!existing) {
        throw new NotFoundException(`Worker pool "${slug}" not found or already archived`);
      }

      const [updated] = await tx
        .update(workerPools)
        .set({ status: 'ARCHIVED', updatedAt: new Date() })
        .where(eq(workerPools.id, existing.id))
        .returning();

      return updated!;
    });
  }

  async submit(slug: string, packageData: SubmitToPoolDto): Promise<PackageRecord> {
    return this.db.transaction(async (tx) => {
      const [pool] = await tx
        .select({ id: workerPools.id, status: workerPools.status })
        .from(workerPools)
        .where(eq(workerPools.slug, slug))
        .limit(1);

      if (!pool) {
        throw new NotFoundException(`Worker pool "${slug}" not found`);
      }

      // Load member worker version configs to validate package type compatibility
      const memberVersions = await tx
        .select({
          id: workerPoolMembers.id,
          poolId: workerPoolMembers.poolId,
          workerVersionId: workerPoolMembers.workerVersionId,
          priority: workerPoolMembers.priority,
          yamlConfig: workerVersions.yamlConfig,
        })
        .from(workerPoolMembers)
        .innerJoin(workerVersions, eq(workerVersions.id, workerPoolMembers.workerVersionId))
        .where(eq(workerPoolMembers.poolId, pool.id));

      const hasCompatibleMember = memberVersions.some((mv) => {
        const config = mv.yamlConfig as Record<string, unknown>;
        const inputTypes = config['inputTypes'];
        return Array.isArray(inputTypes) && inputTypes.includes(packageData.type);
      });

      if (!hasCompatibleMember) {
        throw new BadRequestException(
          `No pool member accepts packages of type "${packageData.type}"`,
        );
      }

      const [pkg] = await tx
        .insert(packages)
        .values({
          type: packageData.type,
          status: 'PENDING',
          metadata: packageData.metadata ?? {},
          createdBy: packageData.createdBy ?? null,
        })
        .returning();

      // TODO: delegate to round-robin router (task 049)
      return pkg!;
    });
  }
}
