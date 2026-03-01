# Task 056: Create Container Module Tests

## Summary
Write unit tests for the concurrency limiter logic and container manager service, plus wire up the `ContainersModule` that registers all container-related services. Docker commands and Redis operations are fully mocked — no real containers or Redis instances are needed for these tests.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 052 (Container Builder Service), 053 (Container Manager Service), 054 (Concurrency Limiter), 055 (Container Log Streamer)
- **Blocks**: None

## Architecture Reference
The `ContainersModule` is a NestJS module that wires together `ContainerBuilderService`, `ContainerManagerService`, `ConcurrencyLimiterService`, and `ContainerLogStreamer`. Tests use NestJS `Test.createTestingModule` with mocked dependencies. Docker interactions are mocked at the `child_process.spawn`/`execFile` level. Redis interactions are mocked at the Redis client level.

## Files and Folders
- `/apps/api/src/modules/containers/__tests__/container-manager.spec.ts` — Unit tests for container manager lifecycle
- `/apps/api/src/modules/containers/__tests__/concurrency-limiter.spec.ts` — Unit tests for concurrency limiter acquire/release/queue logic
- `/apps/api/src/modules/containers/containers.module.ts` — NestJS module wiring all container services together

## Acceptance Criteria
- [ ] **Concurrency limiter tests**: `acquire()` returns `true` when below limit; `acquire()` returns `false` (enqueues) when at limit; `release()` decrements counter and dequeues next job; counter never goes below zero on double-release; Redis Lua script is called with correct arguments; graceful fallback when Redis is unavailable
- [ ] **Container manager tests**: `runJob()` triggers image build if image does not exist; `runJob()` skips build if image exists (cache hit); environment variables are correctly passed to `docker run`; exit code 0 emits `job.completed` event; exit code non-zero emits `job.error` event; `cancelJob()` calls `docker stop` with correct container name; timeout enforcement kills container after configured duration; temp directory is cleaned up on success; temp directory is cleaned up on failure
- [ ] **Module definition**: `ContainersModule` imports and provides all container services; module compiles without circular dependency errors
- [ ] All tests pass with `pnpm --filter api test`
- [ ] Tests do not require Docker daemon or Redis server to run

## Implementation Notes
- Mock `child_process.spawn` using `jest.mock('child_process')` or by injecting a wrapper service that can be swapped in tests.
- For the concurrency limiter, mock the Redis client's `eval` (for Lua scripts), `incr`, `decr`, and `get` methods.
- Use `EventEmitter2` mock to verify events are emitted with correct payloads.
- For container manager tests, simulate the Docker process by creating a mock `ChildProcess` with controllable stdout/stderr streams and an exit event.
- Test the timeout scenario by using `jest.useFakeTimers()` to advance time past the configured timeout.
- The `ContainersModule` should export `ContainerManagerService` and `ConcurrencyLimiterService` for use by other modules (e.g., the job scheduler).
