# Task 054: Create Container Concurrency Limiter

## Summary
Implement global container concurrency limiting using a Redis counter — jobs are held in a waiting queue when the limit is reached and automatically dequeued when running containers exit. This prevents resource exhaustion on the host machine and provides backpressure to the job scheduling system.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 053 (Container Manager Service — the service being rate-limited)
- **Blocks**: 056 (Container Module Tests — tests the limiter logic)

## Architecture Reference
The concurrency limiter sits between the job scheduler and the container manager. When a job is ready to execute, it must first `acquire()` a slot from the limiter. If the global limit is reached, the job enters a waiting queue. When a container exits, `release()` decrements the counter and dequeues the next waiting job. Redis is used as the backing store so the limit is enforced across multiple API server instances (horizontal scaling). The Redis key `smithy:containers:active` holds the current count. The waiting queue can use either RabbitMQ (preferred for durability) or an in-memory queue (simpler for MVP).

## Files and Folders
- `/apps/api/src/modules/containers/concurrency-limiter.service.ts` — Service with `acquire()`, `release()`, `getActiveCount()`, and queue management

## Acceptance Criteria
- [ ] Redis key `smithy:containers:active` tracks the number of currently running containers
- [ ] `acquire()` atomically increments the counter via Redis `INCR` and returns `true` if the new value is at or below the configured limit
- [ ] If `acquire()` would exceed the limit, the counter is NOT incremented and the job is enqueued for later execution
- [ ] `release()` atomically decrements the counter via Redis `DECR` and triggers dequeue of the next waiting job
- [ ] `release()` never decrements below zero (guard against double-release bugs)
- [ ] Global concurrency limit is configurable via `CONTAINER_CONCURRENCY_LIMIT` environment variable (default: 10)
- [ ] `getActiveCount()` returns the current value of the Redis counter
- [ ] Waiting jobs are dequeued in FIFO order
- [ ] The service handles Redis connection failures gracefully (logs error, falls back to allowing execution to prevent complete stall)
- [ ] The service is injectable via NestJS DI (`@Injectable()`)

## Implementation Notes
- The acquire/check/release pattern must be atomic. Use a Redis Lua script to make the increment-if-below-limit operation atomic:
  ```lua
  local current = redis.call('GET', KEYS[1]) or 0
  if tonumber(current) < tonumber(ARGV[1]) then
    return redis.call('INCR', KEYS[1])
  else
    return -1
  end
  ```
  This prevents race conditions where two servers both read the count as 9 (limit 10) and both increment to 10.
- For the MVP, an in-memory queue (array of pending job callbacks/promises) is acceptable. For production, the queue should be backed by RabbitMQ with a dedicated queue (`smithy.jobs.pending`) so jobs survive server restarts.
- Set a TTL on the Redis key (e.g., 1 hour) as a safety net — if the server crashes without releasing, the counter will eventually reset. Alternatively, implement a periodic reconciliation that checks actual running containers via `docker ps` and corrects the counter.
- Consider exposing a `forceRelease(jobId)` method for admin use when a container is stuck.
- The `DECR` command can go negative if called more times than `INCR`. Guard against this by checking the value after decrement and resetting to 0 if negative.
