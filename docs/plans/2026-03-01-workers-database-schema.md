# Workers Database Schema Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create Drizzle ORM schema for `workers` and `worker_versions` tables with a `workerVersionStatus` PostgreSQL enum.

**Architecture:** Two tables — `workers` (named, slugged processing units) and `worker_versions` (immutable, append-only config snapshots linked to a worker). The version status enum tracks lifecycle. A composite unique constraint prevents duplicate version numbers per worker.

**Tech Stack:** Drizzle ORM (`drizzle-orm/pg-core`), TypeScript, Vitest

---

### Task 1: Write workers.ts schema file

**Files:**
- Create: `apps/api/src/database/schema/workers.ts`

**Step 1: Write the schema file**

```ts
import { pgEnum, pgTable, uuid, varchar, text, integer, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const workerVersionStatusEnum = pgEnum('worker_version_status', [
  'ACTIVE',
  'DEPRECATED',
]);

export const workers = pgTable('workers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(),
  slug: varchar('slug').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const workerVersions = pgTable('worker_versions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workerId: uuid('worker_id').notNull().references(() => workers.id),
  version: integer('version').notNull(),
  yamlConfig: jsonb('yaml_config').notNull(),
  dockerfileHash: varchar('dockerfile_hash'),
  status: workerVersionStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => ({
  workerVersionUnique: unique().on(table.workerId, table.version),
}));
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

---

### Task 2: Write tests for workers.ts

**Files:**
- Create: `apps/api/src/database/schema/workers.spec.ts`

**Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { workerVersionStatusEnum, workers, workerVersions } from './workers';

describe('workerVersionStatusEnum', () => {
  it('is defined', () => {
    expect(workerVersionStatusEnum).toBeDefined();
  });

  it('has enumValues with ACTIVE and DEPRECATED', () => {
    const values = workerVersionStatusEnum.enumValues;
    expect(values).toContain('ACTIVE');
    expect(values).toContain('DEPRECATED');
    expect(values).toHaveLength(2);
  });
});

describe('workers table', () => {
  it('is defined', () => {
    expect(workers).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(workers[Symbol.for('drizzle:Name')]).toBe('workers');
  });

  it('has all required columns', () => {
    expect(workers.id).toBeDefined();
    expect(workers.name).toBeDefined();
    expect(workers.slug).toBeDefined();
    expect(workers.description).toBeDefined();
    expect(workers.createdAt).toBeDefined();
    expect(workers.updatedAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(workers.id.columnType).toBe('PgUUID');
  });

  it('name column is varchar and not null', () => {
    expect(workers.name.columnType).toBe('PgVarchar');
    expect(workers.name.notNull).toBe(true);
  });

  it('slug column is varchar and not null', () => {
    expect(workers.slug.columnType).toBe('PgVarchar');
    expect(workers.slug.notNull).toBe(true);
  });

  it('description column is text and nullable', () => {
    expect(workers.description.columnType).toBe('PgText');
    expect(workers.description.notNull).toBe(false);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(workers.createdAt.columnType).toBe('PgTimestamp');
    expect(workers.createdAt.notNull).toBe(true);
  });

  it('updatedAt column is timestamp and not null', () => {
    expect(workers.updatedAt.columnType).toBe('PgTimestamp');
    expect(workers.updatedAt.notNull).toBe(true);
  });
});

describe('workerVersions table', () => {
  it('is defined', () => {
    expect(workerVersions).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(workerVersions[Symbol.for('drizzle:Name')]).toBe('worker_versions');
  });

  it('has all required columns', () => {
    expect(workerVersions.id).toBeDefined();
    expect(workerVersions.workerId).toBeDefined();
    expect(workerVersions.version).toBeDefined();
    expect(workerVersions.yamlConfig).toBeDefined();
    expect(workerVersions.dockerfileHash).toBeDefined();
    expect(workerVersions.status).toBeDefined();
    expect(workerVersions.createdAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(workerVersions.id.columnType).toBe('PgUUID');
  });

  it('workerId column is uuid and not null', () => {
    expect(workerVersions.workerId.columnType).toBe('PgUUID');
    expect(workerVersions.workerId.notNull).toBe(true);
  });

  it('version column is integer and not null', () => {
    expect(workerVersions.version.columnType).toBe('PgInteger');
    expect(workerVersions.version.notNull).toBe(true);
  });

  it('yamlConfig column is jsonb and not null', () => {
    expect(workerVersions.yamlConfig.columnType).toBe('PgJsonb');
    expect(workerVersions.yamlConfig.notNull).toBe(true);
  });

  it('dockerfileHash column is varchar and nullable', () => {
    expect(workerVersions.dockerfileHash.columnType).toBe('PgVarchar');
    expect(workerVersions.dockerfileHash.notNull).toBe(false);
  });

  it('status column references the workerVersionStatus enum', () => {
    expect(workerVersions.status.columnType).toBe('PgEnumColumn');
    expect(workerVersions.status.notNull).toBe(true);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(workerVersions.createdAt.columnType).toBe('PgTimestamp');
    expect(workerVersions.createdAt.notNull).toBe(true);
  });
});

describe('schema/index re-exports workers', () => {
  it('re-exports workerVersionStatusEnum, workers, and workerVersions', async () => {
    const idx = await import('./index');
    expect(idx.workerVersionStatusEnum).toBeDefined();
    expect(idx.workers).toBeDefined();
    expect(idx.workerVersions).toBeDefined();
  });
});
```

**Step 2: Run tests**

Run: `cd apps/api && pnpm test`
Expected: All pass

---

### Task 3: Add workers to index barrel

**Files:**
- Modify: `apps/api/src/database/schema/index.ts`

**Step 1: Add the export**

```ts
export * from './packages';
export * from './workers';
```

**Step 2: Run all tests**

Run: `cd apps/api && pnpm test`
Expected: All pass

**Step 3: Commit**

```bash
git add apps/api/src/database/schema/workers.ts apps/api/src/database/schema/workers.spec.ts apps/api/src/database/schema/index.ts
git commit -m "feat(api): create workers database schema with worker_versions and status enum"
```
