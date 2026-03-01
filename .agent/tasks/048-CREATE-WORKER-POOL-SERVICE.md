# Task 048: Create Worker Pool Service

## Summary
Create the `WorkerPoolsService` with CRUD operations for Worker Pools and member management, including max concurrency configuration. A Worker Pool is a collection of Worker versions that can process the same type of Package, enabling load distribution and redundancy. Unlike Assembly Lines (sequential), Pools route to a single Worker per Package (parallel fan-out to one).

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 024 (Database Provider Module), 016 (Worker Pool Schema)
- **Blocks**: 049 (Pool Round Robin Router), 050 (Worker Pool REST Controller)

## Architecture Reference
Worker Pools provide an alternative workflow primitive to Assembly Lines. While Assembly Lines define sequential pipelines, Worker Pools define a set of interchangeable Workers that compete for Packages. Each Pool has members (Worker versions) with optional priority weights, and a `maxConcurrency` setting that limits how many Packages can be processed simultaneously across all members. The Pool schema is defined in task 016 with `worker_pools` and `worker_pool_members` tables.

## Files and Folders
- `/apps/api/src/modules/workflows/worker-pools/worker-pools.service.ts` — Service with CRUD and member management
- `/apps/api/src/modules/workflows/worker-pools/dto/create-worker-pool.dto.ts` — DTO for creating a worker pool
- `/apps/api/src/modules/workflows/worker-pools/dto/update-worker-pool.dto.ts` — DTO for updating a worker pool

## Acceptance Criteria
- [ ] `CreateWorkerPoolDto`: `name` (required string), `members` (required array of `{ workerVersionId: UUID, priority?: number }`, min 1 member), `maxConcurrency` (required positive integer)
- [ ] `UpdateWorkerPoolDto`: `name` (optional), `maxConcurrency` (optional positive integer), `members` (optional — replaces all members if provided)
- [ ] `create(dto)` generates slug from name, validates all `workerVersionId` references exist and are not DEPRECATED, inserts pool and members in a transaction
- [ ] `create(dto)` throws ConflictException on duplicate slug
- [ ] `findAll()` returns all pools with member count and current active job count
- [ ] `findBySlug(slug)` returns pool with full member details (worker name, version number, priority) and current queue depth
- [ ] `update(slug, dto)` updates pool settings; if members array is provided, replaces all members in a transaction (delete old, insert new)
- [ ] `archive(slug)` soft-deletes the pool
- [ ] `submit(slug, packageData)` validates the Package type matches at least one member's input types, creates Package, delegates to router (task 049)
- [ ] Default member priority is 1 (equal weight)

## Implementation Notes
- Priority is stored as an integer (higher = more preferred). The round-robin router (task 049) uses priority for weighted distribution. For MVP, priority can be ignored (all equal weight) and implemented later.
- For `submit`, validate input type compatibility by loading the members' worker version configs and checking that `packageData.type` is in at least one member's `inputTypes` array. This requires joining through to the worker version's YAML config.
- The `maxConcurrency` limit is enforced at the router level (task 049) using Redis, not in this service. This service just stores the configuration.
- For `findBySlug` with queue depth, the queue depth comes from RabbitMQ (or Redis). If the event bus (task 067) is not yet available, return `null` for queue depth and add a TODO.
- Member replacement on update uses a simple strategy: delete all existing members, insert new ones. This is simpler than diffing and handles reordering. Use a transaction to prevent inconsistent state.
- Consider adding `addMember(slug, member)` and `removeMember(slug, workerVersionId)` methods for fine-grained member management. For MVP, full replacement via update is sufficient.
