# Task 055: Create Container Log Streaming

## Summary
Implement container log streaming — pipe container stdout/stderr into structured log entries with level, message, timestamp, and metadata, persist them into the `job_executions.logs` JSONB array column, and emit entries via the event bus for real-time Socket.IO forwarding. The implementation uses stream processing to handle high-volume output without memory exhaustion.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 053 (Container Manager Service — provides the container process stdout/stderr streams)
- **Blocks**: 056 (Container Module Tests — tests the streamer)

## Architecture Reference
Container output flows through a pipeline: Docker container stdout/stderr → Node.js readable streams → line-by-line parser → structured log entry → dual output (DB append + event emission). The streamer is a service consumed by the `ContainerManagerService` — when a container is spawned, its stdout/stderr streams are piped to the streamer. Structured entries are appended to the `job_executions.logs` JSONB column (array of objects). Entries are also emitted as events for the RealtimeService (task 074) to forward via Socket.IO.

## Files and Folders
- `/apps/api/src/modules/containers/container-log-streamer.ts` — Service/class for stream processing, parsing, persistence, and event emission

## Acceptance Criteria
- [ ] Accepts Node.js `Readable` streams (stdout and stderr from a spawned container process)
- [ ] Parses output line-by-line using a stream transform (e.g., `readline` interface or custom Transform stream)
- [ ] Each line is converted to a structured log entry: `{ level: 'info'|'warn'|'error'|'debug', message: string, timestamp: string, metadata?: Record<string, unknown> }`
- [ ] stdout lines default to level `info`; stderr lines default to level `error`
- [ ] If a line is valid JSON with a `level` field (Workers using structured logging), the level is extracted from the JSON
- [ ] Entries are appended to `job_executions.logs` JSONB array in the database
- [ ] Database writes are batched (e.g., every 100ms or 50 entries, whichever comes first) to avoid per-line INSERT overhead
- [ ] Each entry is emitted via the event bus with routing key `job.log.{jobId}` for Socket.IO forwarding
- [ ] High-volume output (thousands of lines per second) does not cause memory issues — uses backpressure-aware stream processing
- [ ] Handles stream end/close events to flush remaining buffered entries

## Implementation Notes
- Use Node.js `readline.createInterface({ input: stream })` for line-by-line parsing — it handles partial lines and buffering correctly.
- For batched DB writes, use a simple timer + buffer pattern: accumulate entries in an array, flush to DB every 100ms or when the buffer reaches 50 entries. Use `jsonb_set` or array append to add entries without replacing the entire column.
- The JSONB append query looks like: `UPDATE job_executions SET logs = logs || $1::jsonb WHERE id = $2` where `$1` is a JSON array of new entries.
- Apply backpressure by pausing the readable stream if the write buffer is too large. Resume when the buffer drains.
- Workers that use the SDK's built-in logger (Pino) will output structured JSON to stdout. The streamer should detect this and parse accordingly. Non-JSON lines are treated as plain text messages.
- Consider adding a maximum log size per job execution (e.g., 10MB of JSONB) to prevent runaway Workers from filling the database. Truncate with a warning entry if exceeded.
- The event emission for Socket.IO should be fire-and-forget — do not block log processing on event delivery.
