# Task 082: Create Log Viewer REST Controller

## Summary
Create `LogsController` with a REST endpoint for paginated, filterable log retrieval and an SSE (Server-Sent Events) endpoint for real-time log streaming of active jobs. The `LogsModule` wires the service and controller together. This provides the backend for the job log viewer in the frontend dashboard.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 081 (Log Ingestion Service — provides log query and streaming)
- **Blocks**: 083 (Log Module Tests)

## Architecture Reference
The `LogsController` exposes two endpoints under `/api/jobs/:jobId/logs`: a standard GET for historical log retrieval and an SSE endpoint for live streaming. The GET endpoint returns paginated, filterable logs from the JSONB column. The SSE endpoint uses NestJS's `@Sse()` decorator to return an RxJS Observable that the framework converts into an SSE response stream. The frontend can use `EventSource` to connect to the SSE endpoint and receive log entries in real-time as a Worker container produces output.

## Files and Folders
- `/apps/api/src/modules/logs/logs.controller.ts` — REST + SSE controller for log access
- `/apps/api/src/modules/logs/logs.module.ts` — NestJS module wiring LogsService and LogsController

## Acceptance Criteria
- [ ] `GET /api/jobs/:jobId/logs` — returns paginated log entries from the job's JSONB logs array
- [ ] Supports query parameters: `?level=warn&after=2024-01-01T00:00:00Z&before=2024-12-31T23:59:59Z&page=1&limit=100`
- [ ] Response shape: `{ data: LogEntry[], meta: { page, limit, total, jobId, jobState } }`
- [ ] Returns 404 if the job execution does not exist
- [ ] `GET /api/jobs/:jobId/logs/stream` — SSE endpoint streaming live log entries for active jobs
- [ ] Uses NestJS `@Sse()` decorator returning an `Observable<MessageEvent>`
- [ ] Each SSE event contains a single `LogEntry` as JSON in the `data` field
- [ ] SSE stream includes `event: log` event type for log entries and `event: complete` when the job finishes
- [ ] SSE stream closes automatically when the job reaches a terminal state
- [ ] Returns 400 if the job is already in a terminal state (no live logs to stream — use the GET endpoint instead)
- [ ] Both endpoints require authentication (JWT guard)
- [ ] `LogsModule` imports `LogsService`, provides `LogsController`, and is importable by `AppModule`

## Implementation Notes
- NestJS SSE pattern:
  ```typescript
  @Sse('stream')
  streamLogs(@Param('jobId') jobId: string): Observable<MessageEvent> {
    return this.logsService.streamLogs(jobId).pipe(
      map(entry => ({
        data: JSON.stringify(entry),
        type: 'log',
      })),
    );
  }
  ```
- The `MessageEvent` type expected by NestJS SSE: `{ data: string | object, id?: string, type?: string, retry?: number }`.
- For the SSE stream, add a `retry: 3000` field on the first event so the `EventSource` client auto-reconnects after 3 seconds if the connection drops.
- Query parameter validation should use a DTO with class-validator decorators: `level` is optional enum, `after`/`before` are optional ISO date strings, `page`/`limit` are optional positive integers with defaults.
- The controller path should be nested under jobs: `@Controller('api/jobs/:jobId/logs')`. This makes it clear that logs are scoped to a specific job.
- For the 400 response on terminal jobs, include a message like: "Job is already completed. Use GET /api/jobs/{jobId}/logs to retrieve historical logs."
- Consider adding a `GET /api/jobs/:jobId/logs/download` endpoint that returns all logs as a downloadable NDJSON file — this is a future enhancement.
