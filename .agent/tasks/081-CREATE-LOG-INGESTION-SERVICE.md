# Task 081: Create Log Ingestion Service

## Summary
Create `LogsService` for appending structured log entries to the `job_executions.logs` JSONB column, querying logs with level/time filters and pagination, and providing an Observable stream of new entries for active jobs. This service backs both the REST log viewer and the SSE live streaming endpoint.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 024 (Database Provider Module — provides database access), 017 (Database Schema/Migrations — job_executions table with logs JSONB column)
- **Blocks**: 082 (Log Viewer REST Controller — exposes logs via HTTP)

## Architecture Reference
Job execution logs are stored as a JSONB array in the `job_executions.logs` column. Each entry is a structured object with level, message, timestamp, and optional metadata. The `LogsService` provides three core operations: (1) append — adds entries to the JSONB array (used by the container log streamer, task 055), (2) query — retrieves log entries with filtering and pagination (used by the REST endpoint), (3) stream — returns an RxJS Observable that emits new entries as they arrive (used by the SSE endpoint). The service is consumed by both the container runtime (write path) and the frontend (read path).

## Files and Folders
- `/apps/api/src/modules/logs/logs.service.ts` — Log ingestion, querying, and streaming service

## Acceptance Criteria
- [ ] `appendLog(jobId: string, entry: LogEntry)` appends a single entry to the `job_executions.logs` JSONB array using PostgreSQL JSONB array append
- [ ] `appendLogs(jobId: string, entries: LogEntry[])` appends multiple entries in a single database operation (batch append)
- [ ] `LogEntry` type: `{ level: 'debug' | 'info' | 'warn' | 'error', message: string, timestamp: string, metadata?: Record<string, unknown> }`
- [ ] `getLogs(jobId: string, filters?: { level?: string, after?: string, before?: string }, pagination?: { page: number, limit: number })` queries the JSONB array with filtering and returns paginated results with total count
- [ ] Level filter returns entries at or above the specified level (e.g., `level=warn` returns warn + error)
- [ ] Time range filters (`after`, `before`) filter by the entry's `timestamp` field
- [ ] `streamLogs(jobId: string)` returns an RxJS `Observable<LogEntry>` that emits new entries as they are appended
- [ ] Stream completes when the job reaches a terminal state (COMPLETED, FAILED, CANCELLED)
- [ ] The service is injectable via NestJS DI (`@Injectable()`)

## Implementation Notes
- JSONB array append query:
  ```sql
  UPDATE job_executions
  SET logs = COALESCE(logs, '[]'::jsonb) || $1::jsonb
  WHERE id = $2
  ```
  Where `$1` is a JSON array of new entries. The `COALESCE` handles the case where `logs` is NULL (first entry).
- For querying JSONB arrays with filters, use `jsonb_array_elements`:
  ```sql
  SELECT elem FROM job_executions,
    jsonb_array_elements(logs) AS elem
  WHERE id = $1
    AND elem->>'level' IN ('warn', 'error')
    AND (elem->>'timestamp')::timestamptz > $2
  ORDER BY (elem->>'timestamp')::timestamptz
  OFFSET $3 LIMIT $4
  ```
- For the streaming Observable, use a combination of RxJS `Subject` and an event-based pattern. When `appendLog` is called, emit the entry to any active stream for that jobId. Use a `Map<jobId, Subject<LogEntry>>` to track active streams.
- Level hierarchy for filtering: debug < info < warn < error. When filtering by level, include all levels at or above the specified level.
- Consider adding a maximum log size guard: if the JSONB array exceeds a configurable size (e.g., 10,000 entries or 10MB), reject further appends with a warning entry and set a flag on the job execution.
- For pagination of JSONB arrays, the total count query needs a separate `jsonb_array_length(logs)` call (or filtered count via subquery). This is a known performance consideration for large JSONB arrays.
- The stream should use backpressure — if the consumer (SSE client) is slow, buffer a reasonable amount and then drop old entries with a warning.
