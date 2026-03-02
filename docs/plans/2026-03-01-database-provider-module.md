# Database Provider Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a NestJS `DatabaseModule` that provides a typed Drizzle ORM client as an injectable `DRIZZLE` service, backed by a `pg.Pool` connection pool configured from `ConfigService`.

**Architecture:** A custom NestJS factory provider creates a `pg.Pool` from the `database.url` config key, then constructs a Drizzle client bound to the full schema (imported from `src/database/schema/index.ts`). The module is marked `@Global()` so it is imported once in `AppModule` and any feature module can `@Inject(DRIZZLE)` without additional imports.

**Tech Stack:** NestJS (DI, lifecycle hooks), `drizzle-orm/node-postgres`, `pg` (node-postgres), `@nestjs/config` ConfigService, Vitest

---

### Task 1: Add `pg` dependency

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Install pg and its types**

```bash
cd apps/api && pnpm add pg && pnpm add -D @types/pg
```

**Step 2: Verify pg is in dependencies**

```bash
cat apps/api/package.json | grep '"pg"'
```
Expected: `"pg": "^8.x.x"` in `dependencies` and `"@types/pg": "..."` in `devDependencies`

**Step 3: Verify drizzle node-postgres adapter is available**

```bash
node -e "require('drizzle-orm/node-postgres')" 2>&1 || echo "not available"
```

---

### Task 2: Create `database.constants.ts`

**Files:**
- Create: `apps/api/src/database/database.constants.ts`

**Step 1: Write the failing test**

Create `apps/api/src/database/database.constants.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DRIZZLE } from './database.constants';

describe('database.constants', () => {
  it('exports DRIZZLE as a Symbol', () => {
    expect(typeof DRIZZLE).toBe('symbol');
  });

  it('DRIZZLE symbol description is "DRIZZLE"', () => {
    expect(DRIZZLE.toString()).toBe('Symbol(DRIZZLE)');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test -- --reporter=verbose database.constants
```
Expected: FAIL with "Cannot find module './database.constants'"

**Step 3: Write minimal implementation**

Create `apps/api/src/database/database.constants.ts`:

```ts
export const DRIZZLE = Symbol('DRIZZLE');
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test -- --reporter=verbose database.constants
```
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add apps/api/src/database/database.constants.ts apps/api/src/database/database.constants.spec.ts
git commit -m "feat(api): add DRIZZLE injection token constant (task-024)"
```

---

### Task 3: Create `database.provider.ts`

**Files:**
- Create: `apps/api/src/database/database.provider.ts`
- Create: `apps/api/src/database/database.provider.spec.ts`

**Step 1: Write the failing tests**

Create `apps/api/src/database/database.provider.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DRIZZLE, drizzleProvider } from './database.provider';

// Mock pg Pool
const mockPoolQuery = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
const mockPoolEnd = vi.fn().mockResolvedValue(undefined);
const MockPool = vi.fn().mockImplementation(() => ({
  query: mockPoolQuery,
  end: mockPoolEnd,
}));

vi.mock('pg', () => ({ Pool: MockPool }));

// Mock drizzle-orm/node-postgres
const mockDrizzleInstance = { _tag: 'DrizzleClient' };
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => mockDrizzleInstance),
}));

// Mock schema
vi.mock('./schema', () => ({ someTable: {} }));

describe('drizzleProvider', () => {
  it('has DRIZZLE as provide token', () => {
    expect(drizzleProvider.provide).toBe(DRIZZLE);
  });

  it('injects ConfigService', () => {
    const { ConfigService } = require('@nestjs/config');
    expect(drizzleProvider.inject).toContain(ConfigService);
  });

  describe('useFactory', () => {
    let mockConfigService: { get: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      vi.clearAllMocks();
      mockConfigService = {
        get: vi.fn().mockReturnValue('postgresql://user:pass@localhost:5432/test'),
      };
    });

    it('creates pg.Pool with database URL from ConfigService', async () => {
      const { Pool } = await import('pg');
      await drizzleProvider.useFactory(mockConfigService as any);
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: 'postgresql://user:pass@localhost:5432/test',
        }),
      );
      expect(mockConfigService.get).toHaveBeenCalledWith('database.url');
    });

    it('creates Pool with default max=20', async () => {
      const { Pool } = await import('pg');
      await drizzleProvider.useFactory(mockConfigService as any);
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({ max: 20 }),
      );
    });

    it('creates Pool with default idleTimeoutMillis=30000', async () => {
      const { Pool } = await import('pg');
      await drizzleProvider.useFactory(mockConfigService as any);
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({ idleTimeoutMillis: 30000 }),
      );
    });

    it('creates Pool with default connectionTimeoutMillis=5000', async () => {
      const { Pool } = await import('pg');
      await drizzleProvider.useFactory(mockConfigService as any);
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({ connectionTimeoutMillis: 5000 }),
      );
    });

    it('runs SELECT 1 to verify connection', async () => {
      await drizzleProvider.useFactory(mockConfigService as any);
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns drizzle instance', async () => {
      const result = await drizzleProvider.useFactory(mockConfigService as any);
      expect(result).toBe(mockDrizzleInstance);
    });

    it('passes schema to drizzle()', async () => {
      const { drizzle } = await import('drizzle-orm/node-postgres');
      await drizzleProvider.useFactory(mockConfigService as any);
      expect(drizzle).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ schema: expect.any(Object) }),
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test -- --reporter=verbose database.provider
```
Expected: FAIL

**Step 3: Write implementation**

Create `apps/api/src/database/database.provider.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { DRIZZLE } from './database.constants';

export type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

export const drizzleProvider = {
  provide: DRIZZLE,
  inject: [ConfigService],
  useFactory: async (config: ConfigService): Promise<DrizzleClient> => {
    const pool = new Pool({
      connectionString: config.get<string>('database.url'),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    await pool.query('SELECT 1');

    return drizzle(pool, { schema });
  },
};

export { DRIZZLE };
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test -- --reporter=verbose database.provider
```
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add apps/api/src/database/database.provider.ts apps/api/src/database/database.provider.spec.ts
git commit -m "feat(api): add Drizzle provider factory (task-024)"
```

---

### Task 4: Create `database.module.ts`

**Files:**
- Create: `apps/api/src/database/database.module.ts`
- Create: `apps/api/src/database/database.module.spec.ts`

**Step 1: Write the failing tests**

Create `apps/api/src/database/database.module.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from './database.module';
import { DRIZZLE } from './database.constants';

const mockPoolQuery = vi.fn().mockResolvedValue({ rows: [] });
const mockPoolEnd = vi.fn().mockResolvedValue(undefined);
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: mockPoolQuery,
    end: mockPoolEnd,
  })),
}));

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ _tag: 'DrizzleClient' })),
}));

vi.mock('./schema', () => ({ someTable: {} }));

const mockConfigService = {
  get: vi.fn().mockReturnValue('postgresql://user:pass@localhost:5432/test'),
};

describe('DatabaseModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    module = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('is defined', () => {
    expect(module).toBeDefined();
  });

  it('provides the DRIZZLE token', () => {
    const db = module.get(DRIZZLE);
    expect(db).toBeDefined();
    expect(db).toHaveProperty('_tag', 'DrizzleClient');
  });

  it('drains the pool on module destroy', async () => {
    const dbModule = module.get(DatabaseModule);
    await dbModule.onModuleDestroy();
    expect(mockPoolEnd).toHaveBeenCalledTimes(1);
  });

  it('verifies connection on initialization (SELECT 1 called)', () => {
    expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test -- --reporter=verbose database.module
```
Expected: FAIL

**Step 3: Write implementation**

Create `apps/api/src/database/database.module.ts`:

```ts
import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ConfigService } from '@nestjs/config';
import * as schema from './schema';
import { DRIZZLE } from './database.constants';
import type { DrizzleClient } from './database.provider';

const PG_POOL = Symbol('PG_POOL');

const poolProvider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Pool => {
    return new Pool({
      connectionString: config.get<string>('database.url'),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  },
};

const drizzleProvider = {
  provide: DRIZZLE,
  inject: [PG_POOL],
  useFactory: async (pool: Pool): Promise<DrizzleClient> => {
    await pool.query('SELECT 1');
    return drizzle(pool, { schema }) as DrizzleClient;
  },
};

@Global()
@Module({
  providers: [poolProvider, drizzleProvider],
  exports: [drizzleProvider],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
```

Note: Need to add `Inject` to the `@nestjs/common` import.

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test -- --reporter=verbose database.module
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/database/database.module.ts apps/api/src/database/database.module.spec.ts
git commit -m "feat(api): add global DatabaseModule with lifecycle hooks (task-024)"
```

---

### Task 5: Update `app.module.ts` to import DatabaseModule

**Files:**
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/app.module.spec.ts`

**Step 1: Update app.module.ts**

Add `DatabaseModule` import to `AppModule`. The updated file:

```ts
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        redact: ['req.headers.authorization'],
        autoLogging: true,
      },
    }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
```

**Step 2: Update app.module.spec.ts to mock pg and drizzle**

The existing spec will need mocks so it doesn't try to connect to a real DB. Add these mocks at the top of the file:

```ts
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ _tag: 'DrizzleClient' })),
}));
```

**Step 3: Run tests to verify app.module passes**

```bash
cd apps/api && pnpm test -- --reporter=verbose app.module
```
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/app.module.spec.ts
git commit -m "feat(api): wire DatabaseModule into AppModule (task-024)"
```

---

### Task 6: Verify full test suite and coverage

**Step 1: Run all tests with coverage**

```bash
cd apps/api && pnpm test
```
Expected: All passing, coverage ≥80%, database/* at 100% branch coverage

**Step 2: Run typecheck**

```bash
cd apps/api && pnpm typecheck
```
Expected: No errors

**Step 3: Run lint**

```bash
cd apps/api && pnpm lint
```
Expected: No errors

**Step 4: Final commit if any lint fixes needed**

```bash
git add -A && git commit -m "chore(api): lint fixes for database module (task-024)"
```

---

### Task 7: Integration smoke test

**Step 1: Build the app**

```bash
cd apps/api && pnpm build
```
Expected: Successful build, no TypeScript errors

**Step 2: Verify no runtime startup errors (optional if no DB available)**

If a local DB is available:
```bash
DATABASE_URL=postgresql://smithy:smithy@localhost:5432/smithy \
  REDIS_URL=redis://localhost:6379 \
  RABBITMQ_URL=amqp://smithy:smithy@localhost:5672 \
  MINIO_ENDPOINT=http://localhost:9000 \
  MINIO_ACCESS_KEY=smithy \
  MINIO_SECRET_KEY=smithy_secret \
  MINIO_BUCKET=smithy \
  node apps/api/dist/main.js &
sleep 3 && curl http://localhost:3000/health && kill %1
```

---

### Task 8: Merge and finalize

**Step 1: Update PROGRESS.md**

Change `Current task: 024` to `Current task: 025`.

**Step 2: Final commit**

```bash
git add .agent/PROGRESS.md
git commit -m "chore: advance to task 025 (task-024 complete)"
```

**Step 3: Merge to main**

```bash
git checkout main
git merge feature/task-024 --no-ff -m "Merge feature/task-024: create Database Provider Module"
```

**Step 4: Push if remote exists**

```bash
git remote | grep origin && git push origin main
```
