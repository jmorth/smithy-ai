# Task 051: Create Worker Pool Tests

## Summary
Write unit tests for the round-robin router logic (distribution algorithm, Redis counter persistence, concurrency enforcement) and integration tests for all Worker Pool REST endpoints. These tests verify that Packages are distributed evenly across Pool members and that the API behaves correctly for all CRUD and submission operations.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 050 (Worker Pool REST Controller)
- **Blocks**: None directly

## Architecture Reference
Worker Pool tests focus on two distinct areas: the routing algorithm (pure logic with Redis mocking) and the HTTP API layer (controller integration). The round-robin router tests are mathematically verifiable — N submissions to a pool with M members should produce a near-uniform distribution. Concurrency tests verify that the router respects the `maxConcurrency` limit and correctly tracks active jobs.

## Files and Folders
- `/apps/api/src/modules/workflows/worker-pools/__tests__/pool-router.spec.ts` — Unit tests for PoolRouterService
- `/apps/api/src/modules/workflows/worker-pools/__tests__/worker-pools.service.spec.ts` — Unit tests for WorkerPoolsService
- `/apps/api/src/modules/workflows/worker-pools/__tests__/worker-pools.controller.spec.ts` — Integration tests for WorkerPoolsController

## Acceptance Criteria
- [ ] **Router tests**: Round-robin distributes evenly — 6 submissions to a 3-member pool: each member receives exactly 2 jobs
- [ ] **Router tests**: Counter persists across calls — sequential calls to `route()` advance the counter correctly
- [ ] **Router tests**: Counter wraps around after cycling through all members
- [ ] **Router tests**: Concurrency limit enforcement — when active count equals maxConcurrency, returns "queued" status instead of "dispatched"
- [ ] **Router tests**: Active counter decrements on job completion event
- [ ] **Router tests**: Deprecated members are skipped in the rotation
- [ ] **Router tests**: Single-member pool always routes to the same worker
- [ ] **Service tests**: `create()` validates member workerVersionIds exist; rejects non-existent IDs
- [ ] **Service tests**: `create()` generates correct slug; rejects duplicate slugs
- [ ] **Service tests**: `update()` with members array replaces all members atomically
- [ ] **Service tests**: `submit()` validates package type compatibility with at least one member
- [ ] **Controller integration tests**: All 6 endpoints return correct HTTP status codes
- [ ] **Controller integration tests**: Submit endpoint returns package and routing info
- [ ] **Controller integration tests**: Invalid member references return 400
- [ ] All tests pass when run with `pnpm --filter api test`

## Implementation Notes
- For router tests, mock Redis with an in-memory implementation: maintain a `Map<string, number>` that simulates `INCR` and `GET`. This is simpler and faster than using a real Redis instance.
- For the round-robin distribution test, use a loop:
  ```typescript
  const counts = new Map<string, number>();
  for (let i = 0; i < 6; i++) {
    const result = await router.route(poolSlug, `package-${i}`);
    counts.set(result.workerSlug, (counts.get(result.workerSlug) || 0) + 1);
  }
  expect(counts.get('worker-a')).toBe(2);
  expect(counts.get('worker-b')).toBe(2);
  expect(counts.get('worker-c')).toBe(2);
  ```
- For concurrency tests, pre-set the Redis active counter to `maxConcurrency - 1`, submit a job (should succeed), then submit another (should return "queued").
- For the deprecated member skip test, set up a 3-member pool where member 2 is deprecated. Verify that the router skips member 2 and distributes between members 1 and 3.
- For controller integration tests, mock `WorkerPoolsService` and `PoolRouterService`. Verify HTTP status codes, response shapes, and that service methods are called with correct arguments.
- Consider testing the interaction between submit and route: verify that `WorkerPoolsService.submit()` calls `PoolRouterService.route()` with the correct arguments and propagates the routing result.
