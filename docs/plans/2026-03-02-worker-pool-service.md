# Worker Pool Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `WorkerPoolsService` with CRUD and member management for Worker Pools, following the same patterns as `AssemblyLinesService`.

**Architecture:** Worker Pools define interchangeable Workers that compete for Packages (parallel fan-out to one). The service writes to `worker_pools` and `worker_pool_members` tables. Member replacement uses delete-all/insert-new strategy inside a transaction.

**Tech Stack:** NestJS, Drizzle ORM, class-validator, class-transformer, Vitest

---

### Task 1: CreateWorkerPoolDto

**Files:**
- Create: `apps/api/src/modules/workflows/worker-pools/dto/create-worker-pool.dto.ts`
- Create: `apps/api/src/modules/workflows/worker-pools/dto/create-worker-pool.dto.spec.ts`

**Step 1: Write failing test**
```typescript
// create-worker-pool.dto.spec.ts
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateWorkerPoolDto } from './create-worker-pool.dto';

const validMember = { workerVersionId: '550e8400-e29b-41d4-a716-446655440000' };

describe('CreateWorkerPoolDto', () => {
  it('passes with required fields', async () => { ... });
  it('fails when name is missing', async () => { ... });
  // ... etc
});
```

**Step 2:** Run vitest → FAIL
**Step 3:** Implement DTO
**Step 4:** Run vitest → PASS
**Step 5:** Commit

---

### Task 2: UpdateWorkerPoolDto

**Files:**
- Create: `apps/api/src/modules/workflows/worker-pools/dto/update-worker-pool.dto.ts`
- Create: `apps/api/src/modules/workflows/worker-pools/dto/update-worker-pool.dto.spec.ts`

---

### Task 3: WorkerPoolsService + Spec

**Files:**
- Create: `apps/api/src/modules/workflows/worker-pools/worker-pools.service.ts`
- Create: `apps/api/src/modules/workflows/worker-pools/worker-pools.service.spec.ts`

**Methods:** create, findAll, findBySlug, update, archive, submit

---

### Task 4: WorkerPoolsModule

**Files:**
- Create: `apps/api/src/modules/workflows/worker-pools/worker-pools.module.ts`
- Create: `apps/api/src/modules/workflows/worker-pools/worker-pools.module.spec.ts`

---

### Key Implementation Notes

- Schema: `workerPools` (id, name, slug, description, status, maxConcurrency) + `workerPoolMembers` (id, poolId, workerVersionId, priority)
- `findAll()` → member count via LEFT JOIN + COUNT, activeJobCount = null (TODO: Redis)
- `findBySlug()` → member details via JOIN to workerVersions + workers, queueDepth = null (TODO)
- `submit()` → validate packageData.type in yamlConfig.inputTypes of at least one member, create Package (no assemblyLineId), delegate to router (TODO: task 049)
- Default priority = 1 (application-level, not DB default)
- `archive()` → set status = 'ARCHIVED', filter out already-archived in WHERE clause
