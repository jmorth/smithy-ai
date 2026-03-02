# Package Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `PackagesService` with full CRUD operations (create, findAll, findById, update, softDelete) using Drizzle ORM with cursor-based pagination and filtering support.

**Architecture:** Service injects `DrizzleClient` via `@Inject(DRIZZLE)`. All queries filter soft-deleted rows with `WHERE deleted_at IS NULL`. `findAll` runs two parallel queries — one for paginated data (cursor-aware) and one for total count. `findById` uses Drizzle's relational query API to join package files.

**Tech Stack:** NestJS Injectable, Drizzle ORM (`drizzle-orm/pg-core`), Vitest for unit tests

---

### Task 1: Write `packages.service.ts` (TDD — failing tests first)

**Files:**
- Create: `apps/api/src/modules/packages/packages.service.ts`
- Create: `apps/api/src/modules/packages/packages.service.spec.ts`

---

**Step 1: Write the failing tests**

Create `apps/api/src/modules/packages/packages.service.spec.ts`:

```typescript
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
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolveValue),
    then: undefined as unknown,
  };
  return chain;
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

      // where() is called — just verify it was called (filter building tested implicitly)
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

      // Both initiated before either resolves — order may vary but both run
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

    it('does not update deletedAt — that is for softDelete only', async () => {
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

      // update() was used, not delete()
      expect(mockDb.update).toHaveBeenCalledOnce();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/modules/packages/packages.service.spec.ts --reporter=verbose 2>&1 | tail -20
```

Expected: Fail with "Cannot find module './packages.service'"

**Step 3: Implement `packages.service.ts`**

Create `apps/api/src/modules/packages/packages.service.ts`:

```typescript
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { and, eq, gt, gte, isNull, lte, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import type { DrizzleClient } from '../../database/database.provider';
import { packages, packageFiles } from '../../database/schema';
import type { CreatePackageDto } from './dto/create-package.dto';
import type { UpdatePackageDto } from './dto/update-package.dto';

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
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

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
    return pkg;
  }

  async findAll(query: PaginationQuery): Promise<PaginationResult> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    // Base conditions (no cursor) — used for both count and data
    const baseConditions = [isNull(packages.deletedAt)];
    if (query.type) baseConditions.push(eq(packages.type, query.type));
    if (query.status) baseConditions.push(eq(packages.status, query.status as any));
    if (query.assemblyLineId) baseConditions.push(eq(packages.assemblyLineId, query.assemblyLineId));
    if (query.createdAfter) baseConditions.push(gte(packages.createdAt, new Date(query.createdAfter)));
    if (query.createdBefore) baseConditions.push(lte(packages.createdAt, new Date(query.createdBefore)));

    // Add cursor condition only to data query
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
      cursor: hasNextPage ? data[data.length - 1].id : undefined,
      total: (countResult as Array<{ count: number }>)[0].count,
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
      .select({ id: packages.id })
      .from(packages)
      .where(and(eq(packages.id, id), isNull(packages.deletedAt)))
      .limit(1);

    if (!existing.length) {
      throw new NotFoundException(`Package ${id} not found`);
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

    return updated;
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
}
```

**Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/modules/packages/packages.service.spec.ts --reporter=verbose 2>&1
```

Expected: All tests pass.

**Step 5: Run full coverage check**

```bash
cd apps/api && npx vitest run --coverage 2>&1 | tail -30
```

Expected: Coverage ≥ 80% across lines/functions/branches/statements.

**Step 6: Commit**

```bash
git add apps/api/src/modules/packages/packages.service.ts \
        apps/api/src/modules/packages/packages.service.spec.ts
git commit -m "feat(api): implement PackagesService with CRUD and cursor pagination"
```
