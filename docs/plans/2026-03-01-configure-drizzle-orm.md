# Configure Drizzle ORM Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install and configure Drizzle ORM with the postgres.js driver in `apps/api`, providing a typed database client factory, Drizzle Kit for migrations, and a schema barrel ready for future table definitions.

**Architecture:** Drizzle ORM is wired to PostgreSQL via postgres.js with connection pooling. The `db.ts` module exports a factory function (for testability/DI) plus a default singleton. `drizzle.config.ts` at the app root points Drizzle Kit at the schema barrel and a `DATABASE_URL` env var.

**Tech Stack:** drizzle-orm, drizzle-kit, postgres (postgres.js), NestJS, Vitest, pnpm workspaces

---

### Task 1: Install Dependencies

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Install runtime and dev dependencies**

```bash
cd apps/api
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
```

**Step 2: Verify package.json has the new deps**

```bash
grep -E "drizzle|postgres" apps/api/package.json
```

Expected output includes `drizzle-orm`, `drizzle-kit`, `postgres`.

**Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): install drizzle-orm, drizzle-kit, postgres driver"
```

---

### Task 2: Add db:generate, db:migrate, db:studio scripts

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Write the failing test** (manual verify — run after scripts added)

These are CLI scripts; test is that they appear in `package.json`.

**Step 2: Add scripts to package.json**

Add to the `scripts` block:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

**Step 3: Verify scripts exist**

```bash
node -e "const p=require('./apps/api/package.json'); ['db:generate','db:migrate','db:studio'].forEach(s=>{ if(!p.scripts[s]) throw new Error('missing '+s) }); console.log('OK')"
```

Expected: `OK`

**Step 4: Commit**

```bash
git add apps/api/package.json
git commit -m "feat(api): add db:generate, db:migrate, db:studio scripts"
```

---

### Task 3: Create schema barrel export

**Files:**
- Create: `apps/api/src/database/schema/index.ts`
- Delete: `apps/api/src/database/.gitkeep`

**Step 1: Write the failing test**

Create `apps/api/src/database/schema/index.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('schema/index barrel', () => {
  it('exports an object (may be empty)', async () => {
    const schema = await import('./index');
    expect(schema).toBeDefined();
    expect(typeof schema).toBe('object');
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
cd apps/api && pnpm test -- --run src/database/schema/index.spec.ts
```

Expected: FAIL — module not found.

**Step 3: Create the barrel**

`apps/api/src/database/schema/index.ts`:
```ts
// Schema barrel — table definitions imported here by tasks 014-017
export {};
```

**Step 4: Run test to confirm it passes**

```bash
cd apps/api && pnpm test -- --run src/database/schema/index.spec.ts
```

Expected: PASS

**Step 5: Remove .gitkeep**

```bash
rm apps/api/src/database/.gitkeep
```

**Step 6: Commit**

```bash
git add apps/api/src/database/schema/index.ts apps/api/src/database/schema/index.spec.ts
git rm apps/api/src/database/.gitkeep
git commit -m "feat(api): add schema barrel export"
```

---

### Task 4: Create drizzle.config.ts

**Files:**
- Create: `apps/api/drizzle.config.ts`

**Step 1: Verify drizzle-kit is available**

```bash
cd apps/api && pnpm exec drizzle-kit --version
```

Expected: prints a version string.

**Step 2: Create the config**

`apps/api/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/database/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**Step 3: Verify the file is valid TypeScript**

```bash
cd apps/api && pnpm exec tsc --noEmit --skipLibCheck drizzle.config.ts 2>&1 || true
```

Note: drizzle.config.ts is outside `rootDir` intentionally (it's a tool config, not compiled). The tsc check above may warn about rootDir — that's fine. The file will be used only by drizzle-kit.

**Step 4: Commit**

```bash
git add apps/api/drizzle.config.ts
git commit -m "feat(api): add drizzle.config.ts for migration management"
```

---

### Task 5: Create db.ts — database client factory

**Files:**
- Create: `apps/api/src/database/db.ts`
- Create: `apps/api/src/database/db.spec.ts`

**Step 1: Write the failing tests**

`apps/api/src/database/db.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We mock postgres and drizzle-orm/postgres-js so no real DB connection is needed
vi.mock('postgres', () => {
  const mockSql = vi.fn(() => mockSql) as any;
  mockSql.end = vi.fn();
  return { default: vi.fn(() => mockSql) };
});

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn((client, opts) => ({ _client: client, _schema: opts?.schema, query: {} })),
}));

describe('createDb', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, DATABASE_URL: 'postgres://user:pass@localhost:5432/test' };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('returns a drizzle instance when DATABASE_URL is set', async () => {
    const { createDb } = await import('./db');
    const db = createDb();
    expect(db).toBeDefined();
  });

  it('throws when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;
    const { createDb } = await import('./db');
    expect(() => createDb()).toThrow();
  });

  it('accepts custom max pool size', async () => {
    const { createDb } = await import('./db');
    const postgres = await import('postgres');
    createDb({ max: 5 });
    expect(postgres.default).toHaveBeenCalledWith(
      'postgres://user:pass@localhost:5432/test',
      expect.objectContaining({ max: 5 }),
    );
  });
});

describe('db default export', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, DATABASE_URL: 'postgres://user:pass@localhost:5432/test' };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('is a drizzle instance', async () => {
    const mod = await import('./db');
    expect(mod.db).toBeDefined();
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
cd apps/api && pnpm test -- --run src/database/db.spec.ts
```

Expected: FAIL — module not found.

**Step 3: Implement db.ts**

`apps/api/src/database/db.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export interface DbConfig {
  /** Maximum number of connections in the pool. Defaults to 10. */
  max?: number;
}

/**
 * Factory function that creates a configured Drizzle ORM client.
 * Accept optional config for testability and NestJS DI.
 */
export function createDb(config: DbConfig = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const client = postgres(url, { max: config.max ?? 10 });
  return drizzle(client, { schema });
}

/** Default singleton database client. */
export const db = createDb();
```

**Step 4: Run tests to confirm they pass**

```bash
cd apps/api && pnpm test -- --run src/database/db.spec.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add apps/api/src/database/db.ts apps/api/src/database/db.spec.ts
git commit -m "feat(api): add db.ts database client factory with createDb"
```

---

### Task 6: Run full test suite and validate coverage

**Step 1: Run all tests with coverage**

```bash
cd apps/api && pnpm test
```

Expected: all existing tests pass, coverage thresholds met (≥80%).

**Step 2: Check overall coverage output**

Review the text coverage table. If `db.ts` or `schema/index.ts` show uncovered lines, revisit tests in Task 5.

**Step 3: Commit if any fixes needed, then final commit**

```bash
git add -A
git commit -m "test(api): ensure coverage thresholds met for drizzle ORM setup"
```

---

### Task 7: Verify drizzle-kit can reach Docker Compose PostgreSQL

**Step 1: Ensure Docker Compose stack is running**

```bash
docker compose -f docker/docker-compose.dev.yml up -d postgres
```

Wait for healthy:
```bash
docker compose -f docker/docker-compose.dev.yml ps postgres
```

**Step 2: Run db:generate to validate config**

```bash
cd apps/api && DATABASE_URL="postgres://smithy:smithy@localhost:5432/smithy" pnpm db:generate
```

Expected: Drizzle Kit reads config, outputs "No schema changes found" or similar (no tables yet).

**Step 3: Stop Docker services to conserve resources**

```bash
docker compose -f docker/docker-compose.dev.yml stop postgres
```

**Step 4: No commit needed — docker state is not committed**

---
