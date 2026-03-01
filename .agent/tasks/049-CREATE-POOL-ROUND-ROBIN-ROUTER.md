# Task 049: Create Pool Round Robin Router

## Summary
Create the `PoolRouterService` implementing round-robin routing for Worker Pools. The router maintains a per-pool counter in Redis to cycle through eligible Worker members for incoming Packages, respects the global concurrency limit, and publishes jobs to the selected Worker's queue. This distributes work evenly across pool members.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 048 (Worker Pool Service)
- **Blocks**: 050 (Worker Pool REST Controller)

## Architecture Reference
The round-robin router is the scheduling core of Worker Pools. When a Package is submitted to a Pool, the router selects the next eligible Worker using a Redis-backed counter that persists across API restarts. The counter increments atomically (using Redis INCR) and the selected Worker is determined by `counter % members.length`. Before publishing, the router checks the global concurrency limit — if the Pool is at capacity, the job is queued rather than dispatched immediately. Jobs are published to Worker-specific RabbitMQ queues.

## Files and Folders
- `/apps/api/src/modules/workflows/worker-pools/pool-router.service.ts` — Router service with round-robin selection and concurrency enforcement

## Acceptance Criteria
- [ ] Maintains a per-pool round-robin counter in Redis with key `pool:{poolSlug}:rr`
- [ ] Counter is incremented atomically using Redis `INCR` command
- [ ] Worker selection: `members[counter % members.length]` — cycles through members in order
- [ ] Respects `maxConcurrency` limit: checks active job count before dispatching (key: `pool:{poolSlug}:active`)
- [ ] If at capacity: returns a "queued" status indicating the job will be dispatched when a slot opens
- [ ] If under capacity: increments active counter, publishes job to the selected Worker's queue, returns the selected Worker version info
- [ ] Active job counter is decremented when a job completes or fails (via event handler)
- [ ] `route(poolSlug: string, packageId: string): Promise<{ workerSlug: string, workerVersion: number, status: 'dispatched' | 'queued' }>` — main routing method
- [ ] Publishes job message to RabbitMQ with payload: `{ packageId, workerVersionId, poolSlug, timestamp }`
- [ ] Inject Redis client (via ioredis) and RabbitMQ channel

## Implementation Notes
- Use Redis `INCR` for atomic counter increment — this is safe under concurrent access without additional locking.
- For concurrency tracking, use Redis `INCR`/`DECR` on the active counter key. Consider using `INCRBY` with a TTL as a safety net to prevent counters from drifting if a decrement is missed (e.g., worker crashes without reporting completion).
- The "queued" path needs further design: when at capacity, the job message should still be published to a waiting queue. When a slot opens (job completes), the router should pick up the next waiting job. For MVP, a simpler approach is to always publish to the queue and let the concurrency limit be enforced by the Worker containers (only N run simultaneously). Document this simplification.
- If members have different priorities, implement weighted round-robin: expand the member list proportionally to priority weights. E.g., member A (priority 3) and member B (priority 1) becomes [A, A, A, B] in the selection array.
- Consider what happens when a pool member is deprecated after the pool is created: the router should skip deprecated members and select the next eligible one. Add a check in the routing logic.
- Redis connection: inject an ioredis client. If a RedisModule does not yet exist, create a minimal provider using `REDIS_URL` from ConfigService (similar to the approach in task 027 health check).
