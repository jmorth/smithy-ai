# Task 083: Create Log Module Tests

## Summary
Write unit tests for log filtering, pagination, and JSONB append operations in the `LogsService`, plus integration tests for the REST and SSE endpoints in the `LogsController`. SSE tests verify that events are streamed correctly and the stream completes on job termination.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 082 (Log Viewer REST Controller — the module being tested)
- **Blocks**: None

## Architecture Reference
Tests live in the `logs` module's `__tests__` directory. Service tests mock the database layer and verify query construction, filtering logic, and stream behavior. Controller tests use NestJS `Test.createTestingModule` with `supertest` for REST assertions and EventSource simulation for SSE assertions. The SSE tests are the most nuanced — they need to verify streaming behavior over time.

## Files and Folders
- `/apps/api/src/modules/logs/__tests__/logs.service.spec.ts` — Unit tests for LogsService
- `/apps/api/src/modules/logs/__tests__/logs.controller.spec.ts` — Integration tests for REST and SSE endpoints

## Acceptance Criteria
- [ ] **Service tests — appending**: `appendLog` constructs correct JSONB append SQL; `appendLogs` batches entries in a single query; handles NULL logs column (first append via COALESCE)
- [ ] **Service tests — filtering**: level filter returns entries at or above specified level (warn returns warn + error); time range filter (`after`, `before`) correctly filters by timestamp; combined filters work together; default pagination (page 1, limit 100) when not specified
- [ ] **Service tests — pagination**: correct offset calculation from page + limit; total count returned accurately; empty results return empty array with total 0
- [ ] **Service tests — streaming**: `streamLogs` returns Observable that emits entries; new entries appended via `appendLog` are emitted to active streams; stream completes when job reaches terminal state; no memory leaks — completed streams are cleaned up from the tracking Map
- [ ] **Controller tests — REST**: `GET /api/jobs/:jobId/logs` returns 200 with paginated data; query params filter results correctly; returns 404 for non-existent job; returns 401 without auth
- [ ] **Controller tests — SSE**: `GET /api/jobs/:jobId/logs/stream` returns `text/event-stream` content type; emitted events contain log entries as JSON; stream sends `event: complete` when job finishes; returns 400 for terminal-state jobs
- [ ] All tests pass with `pnpm --filter api test`

## Implementation Notes
- For service unit tests, mock the database query functions. Verify the SQL/query builder arguments rather than testing actual PostgreSQL behavior.
- For SSE controller tests, `supertest` does not natively support streaming responses well. Options:
  (a) Use `supertest` with a callback to read the raw response stream:
  ```typescript
  const response = await request(app.getHttpServer())
    .get(`/api/jobs/${jobId}/logs/stream`)
    .set('Authorization', `Bearer ${jwt}`)
    .buffer(false)
    .parse((res, callback) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => callback(null, data));
    });
  ```
  (b) Use the `eventsource` npm package as a test client.
  (c) Directly test the controller method's returned Observable without HTTP.
  Option (c) is simplest for unit tests; option (a) or (b) for integration tests.
- For stream completion tests, use a Subject to control when the job reaches terminal state, then verify the Observable completes.
- Test the memory cleanup: subscribe to a stream, complete it, then verify the stream is no longer in the tracking Map.
- For the level hierarchy test, create entries with all levels and verify each filter level returns the expected subset:
  - `level=debug` → all entries
  - `level=info` → info, warn, error
  - `level=warn` → warn, error
  - `level=error` → error only
