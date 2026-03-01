# Task 050: Create Worker Pool REST Controller

## Summary
Create the `WorkerPoolsController` with REST endpoints for Worker Pool CRUD and Package submission, and wire up the `WorkerPoolsModule` that encapsulates the controller, services (WorkerPoolsService, PoolRouterService), and related providers. Worker Pools provide load-balanced routing of Packages to interchangeable Worker versions.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 048 (Worker Pool Service), 049 (Pool Round Robin Router)
- **Blocks**: 051 (Worker Pool Tests)

## Architecture Reference
The Worker Pools controller follows the same slug-based URL pattern as Workers and Assembly Lines. The submit endpoint creates a Package and routes it through the round-robin router to an available Worker. The detail endpoint includes real-time queue depth and active job counts from Redis, giving operators visibility into Pool utilization. The module sits under `modules/workflows/worker-pools/` alongside Assembly Lines.

## Files and Folders
- `/apps/api/src/modules/workflows/worker-pools/worker-pools.controller.ts` — REST controller with all Worker Pool endpoints
- `/apps/api/src/modules/workflows/worker-pools/worker-pools.module.ts` — Feature module wiring all Worker Pool providers

## Acceptance Criteria
- [ ] `POST /api/worker-pools` — Creates a pool with members, returns 201; 400 on invalid members; 409 on slug conflict
- [ ] `GET /api/worker-pools` — Lists all pools with member count and active job count, returns 200
- [ ] `GET /api/worker-pools/:slug` — Returns pool with full member details, queue depth, and active job count, returns 200; 404 if not found
- [ ] `PATCH /api/worker-pools/:slug` — Updates pool settings/members, returns 200; 404 if not found
- [ ] `DELETE /api/worker-pools/:slug` — Archives (soft deletes) the pool, returns 204; 404 if not found
- [ ] `POST /api/worker-pools/:slug/submit` — Accepts package data, routes to a Worker, returns 201 with Package and routing info (selected worker, dispatch status); 404 if pool not found; 400 if package type is incompatible
- [ ] `:slug` parameter is validated with the slug pipe
- [ ] Submit response includes: `{ package: Package, routing: { workerSlug, workerVersion, status } }`
- [ ] `WorkerPoolsModule` imports `WorkersModule` (for version validation) and declares all local providers
- [ ] `WorkerPoolsModule` is imported in `AppModule`

## Implementation Notes
- Use `@Controller('worker-pools')` — the `/api` prefix is added globally.
- The submit endpoint delegates to `WorkerPoolsService.submit()` which in turn calls `PoolRouterService.route()`. The controller returns both the created Package and the routing decision.
- For the detail endpoint (`GET /:slug`), the queue depth and active job count come from Redis via the `PoolRouterService`. If Redis is unavailable, return `null` for these fields rather than failing the entire request.
- The `WorkerPoolsModule` should export `WorkerPoolsService` for potential use by other modules.
- Consider adding a `GET /api/worker-pools/:slug/packages` endpoint (similar to Assembly Lines) that lists all Packages routed through this Pool. This requires the Package to store a `workerPoolId` reference — verify the schema supports this.
- For the submit request body, use the same shape as Assembly Line submit: `{ type: string, metadata?: Record<string, unknown> }`. This keeps the API consistent across workflow primitives.
