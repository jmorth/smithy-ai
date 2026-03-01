# Task 132: Create Logs Command

## Summary
Create the `smithy logs <job-id>` command that fetches and displays job execution logs from the API. Supports log-level filtering, level-based coloring, and real-time streaming via Server-Sent Events (SSE) with the `--follow` flag.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 122 (CLI Entry Point — provides command routing), 123 (API Client — for log fetching endpoints), 125 (Output Helpers — provides colored output and JSON mode)
- **Blocks**: None

## Architecture Reference
The logs command fetches historical logs from `GET /api/jobs/:jobId/logs` and optionally connects to an SSE endpoint for real-time streaming. Log entries include a timestamp, level (info/warn/error), and message. The command renders logs with level-based coloring and supports filtering by minimum log level.

## Files and Folders
- `/apps/cli/src/commands/ops/logs.ts` — Command handler for `smithy logs`

## Acceptance Criteria
- [ ] `smithy logs <job-id>` fetches and displays all logs for the given job from `GET /api/jobs/:jobId/logs`
- [ ] Log entries displayed with format: `[TIMESTAMP] [LEVEL] MESSAGE`
- [ ] Level-based coloring: info = default/white, warn = yellow, error = red
- [ ] `--follow` flag connects to the SSE endpoint for real-time log streaming after displaying existing logs
- [ ] `--level <level>` flag filters logs by minimum level: `info` (default, shows all), `warn` (warn + error), `error` (error only)
- [ ] `--json` flag outputs raw JSON log entries (one per line, NDJSON format)
- [ ] Ctrl+C cleanly disconnects the SSE stream and exits with code 0
- [ ] Handles 404 responses with a clear "Job not found" error message
- [ ] Shows a spinner while fetching initial logs
- [ ] Exit code 0 on success, 1 on API errors

## Implementation Notes
- For the `--follow` SSE connection, use `fetch` with a streaming response body or the `EventSource` API if available in Bun. Read chunks from the response body and parse SSE events (`data:` lines).
- SSE endpoint URL is likely `GET /api/jobs/:jobId/logs/stream` — confirm with the API task definitions. If the endpoint doesn't exist yet, document the expected contract.
- For level filtering, define a severity order: `info` < `warn` < `error`. Filter out entries below the specified level.
- Timestamps should be formatted in local time for readability. Use a short format like `HH:mm:ss` for the default view and full ISO 8601 for `--json` mode.
- In `--follow` mode, handle connection drops gracefully: print a warning and attempt to reconnect (with backoff) or exit with an error message.
- The SSE stream should be aborted on Ctrl+C. Register a `process.on('SIGINT', ...)` handler that calls `controller.abort()` on the fetch request.
- Consider adding a `--tail <n>` flag that shows only the last N log entries (useful for large log volumes).
