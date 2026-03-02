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
  assemblyLines,
  assemblyLineSteps,
  workerVersions,
  workers,
  packages,
} from '../../../database/schema';
import { generateSlug } from '../../../common/slug.util';
import type { CreateAssemblyLineDto } from './dto/create-assembly-line.dto';
import type { UpdateAssemblyLineDto } from './dto/update-assembly-line.dto';

export type AssemblyLineRecord = typeof assemblyLines.$inferSelect;
export type AssemblyLineStepRecord = typeof assemblyLineSteps.$inferSelect;
export type PackageRecord = typeof packages.$inferSelect;

export type AssemblyLineStepDetail = AssemblyLineStepRecord & {
  workerName: string;
  workerVersionNumber: number;
};

export type AssemblyLineWithStepCount = AssemblyLineRecord & {
  stepCount: number;
};

export type AssemblyLineWithSteps = AssemblyLineRecord & {
  steps: AssemblyLineStepDetail[];
};

export type SubmitPackageDto = {
  type: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
};

@Injectable()
export class AssemblyLinesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  async create(dto: CreateAssemblyLineDto): Promise<AssemblyLineRecord> {
    const slug = generateSlug(dto.name);

    return this.db.transaction(async (tx) => {
      // Check slug uniqueness
      const [existing] = await tx
        .select({ id: assemblyLines.id })
        .from(assemblyLines)
        .where(eq(assemblyLines.slug, slug))
        .limit(1);

      if (existing) {
        throw new ConflictException(`Assembly line with slug "${slug}" already exists`);
      }

      // Validate all workerVersionIds exist and are not DEPRECATED
      const workerVersionIds = dto.steps.map((s) => s.workerVersionId);
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

      // Insert assembly line
      const [line] = await tx
        .insert(assemblyLines)
        .values({ name: dto.name, slug, description: dto.description })
        .returning();

      // Insert steps with sequential step numbers
      const stepValues = dto.steps.map((step, index) => ({
        assemblyLineId: line!.id,
        stepNumber: index + 1,
        workerVersionId: step.workerVersionId,
        configOverrides: step.configOverrides ?? null,
      }));

      await tx.insert(assemblyLineSteps).values(stepValues);

      return line!;
    });
  }

  async findAll(): Promise<AssemblyLineWithStepCount[]> {
    const rows = await this.db
      .select({
        id: assemblyLines.id,
        name: assemblyLines.name,
        slug: assemblyLines.slug,
        description: assemblyLines.description,
        status: assemblyLines.status,
        createdAt: assemblyLines.createdAt,
        updatedAt: assemblyLines.updatedAt,
        stepCount: count(assemblyLineSteps.id),
      })
      .from(assemblyLines)
      .leftJoin(assemblyLineSteps, eq(assemblyLineSteps.assemblyLineId, assemblyLines.id))
      .groupBy(assemblyLines.id);

    return rows as AssemblyLineWithStepCount[];
  }

  async findBySlug(slug: string): Promise<AssemblyLineWithSteps> {
    const [line] = await this.db
      .select()
      .from(assemblyLines)
      .where(eq(assemblyLines.slug, slug))
      .limit(1);

    if (!line) {
      throw new NotFoundException(`Assembly line "${slug}" not found`);
    }

    const steps = await this.db
      .select({
        id: assemblyLineSteps.id,
        assemblyLineId: assemblyLineSteps.assemblyLineId,
        stepNumber: assemblyLineSteps.stepNumber,
        workerVersionId: assemblyLineSteps.workerVersionId,
        configOverrides: assemblyLineSteps.configOverrides,
        workerName: workers.name,
        workerVersionNumber: workerVersions.version,
      })
      .from(assemblyLineSteps)
      .innerJoin(workerVersions, eq(workerVersions.id, assemblyLineSteps.workerVersionId))
      .innerJoin(workers, eq(workers.id, workerVersions.workerId))
      .where(eq(assemblyLineSteps.assemblyLineId, line.id))
      .orderBy(assemblyLineSteps.stepNumber);

    return { ...line, steps: steps as AssemblyLineStepDetail[] };
  }

  async update(slug: string, dto: UpdateAssemblyLineDto): Promise<AssemblyLineRecord> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: assemblyLines.id, slug: assemblyLines.slug })
        .from(assemblyLines)
        .where(eq(assemblyLines.slug, slug))
        .limit(1);

      if (!existing) {
        throw new NotFoundException(`Assembly line "${slug}" not found`);
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (dto.name !== undefined) {
        updates['name'] = dto.name;
        const newSlug = generateSlug(dto.name);

        if (newSlug !== existing.slug) {
          const [collision] = await tx
            .select({ id: assemblyLines.id })
            .from(assemblyLines)
            .where(eq(assemblyLines.slug, newSlug))
            .limit(1);

          if (collision) {
            throw new ConflictException(
              `Assembly line with slug "${newSlug}" already exists`,
            );
          }
        }

        updates['slug'] = newSlug;
      }

      if (dto.description !== undefined) {
        updates['description'] = dto.description;
      }

      if (dto.status !== undefined) {
        updates['status'] = dto.status;
      }

      const [updated] = await tx
        .update(assemblyLines)
        .set(updates as any)
        .where(eq(assemblyLines.id, existing.id))
        .returning();

      return updated!;
    });
  }

  async archive(slug: string): Promise<AssemblyLineRecord> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: assemblyLines.id })
        .from(assemblyLines)
        .where(and(eq(assemblyLines.slug, slug), ne(assemblyLines.status, 'ARCHIVED')))
        .limit(1);

      if (!existing) {
        throw new NotFoundException(`Assembly line "${slug}" not found or already archived`);
      }

      const [updated] = await tx
        .update(assemblyLines)
        .set({ status: 'ARCHIVED', updatedAt: new Date() })
        .where(eq(assemblyLines.id, existing.id))
        .returning();

      return updated!;
    });
  }

  async submit(slug: string, packageData: SubmitPackageDto): Promise<PackageRecord> {
    return this.db.transaction(async (tx) => {
      const [line] = await tx
        .select({ id: assemblyLines.id, status: assemblyLines.status })
        .from(assemblyLines)
        .where(eq(assemblyLines.slug, slug))
        .limit(1);

      if (!line) {
        throw new NotFoundException(`Assembly line "${slug}" not found`);
      }

      const [pkg] = await tx
        .insert(packages)
        .values({
          type: packageData.type,
          status: 'IN_TRANSIT',
          metadata: packageData.metadata ?? {},
          assemblyLineId: line.id,
          currentStep: 1,
          createdBy: packageData.createdBy ?? null,
        })
        .returning();

      return pkg!;
    });
  }
}
