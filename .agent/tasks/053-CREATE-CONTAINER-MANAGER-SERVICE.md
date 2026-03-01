# Task 053: Create Container Manager Service

## Summary
Create `ContainerManagerService` — the core job execution engine that runs Worker containers via Docker, injects environment variables (job ID, API keys, AI provider keys), mounts Package input files, streams stdout/stderr logs, captures exit codes, and emits lifecycle events. This is the central nervous system connecting the API to ephemeral Worker containers.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 052 (Container Builder Service — builds images before run), 024 (Database Provider Module — persists job execution state)
- **Blocks**: 054 (Concurrency Limiter — wraps container runs), 055 (Log Streaming — consumes container output)

## Architecture Reference
Each job execution runs in an isolated Docker container created via `docker run` (child_process). The container is ephemeral — created per job, destroyed after completion. The container receives environment variables for API communication (SMITHY_JOB_ID, SMITHY_PACKAGE_ID, SMITHY_API_URL, SMITHY_API_KEY) plus AI provider API keys. Input Package files are mounted as a read-only volume at `/input`. The container's stdout/stderr is captured for log streaming. Exit code 0 means success; non-zero means failure. The service lives in `apps/api/src/modules/containers/`.

## Files and Folders
- `/apps/api/src/modules/containers/container-manager.service.ts` — Core service with `runJob()`, `cancelJob()`, and container lifecycle management
- `/apps/api/src/modules/containers/container.types.ts` — Type definitions: `ContainerRunOptions`, `ContainerResult`, `ContainerEnv`, `JobExecutionConfig`

## Acceptance Criteria
- [ ] `runJob(jobExecution)` orchestrates the full container lifecycle: build image (if needed) → create temp dir with input files → run container → stream output → capture exit code → emit event → cleanup temp dir
- [ ] Container receives environment variables: `SMITHY_JOB_ID`, `SMITHY_PACKAGE_ID`, `SMITHY_API_URL`, `SMITHY_API_KEY`, plus AI provider keys from Worker config (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)
- [ ] Input Package files are written to a temp directory and mounted read-only at `/input` inside the container
- [ ] Container stdout and stderr are streamed in real-time (not buffered) via `spawn` and piped to the log streamer (task 055)
- [ ] Exit code 0 emits a `job.completed` event with output metadata
- [ ] Exit code non-zero emits a `job.error` event with the exit code and last N lines of stderr
- [ ] `cancelJob(jobId)` sends `docker stop` to the running container (graceful SIGTERM → SIGKILL after timeout)
- [ ] Configurable timeout per Worker (read from Worker YAML config); container is killed if it exceeds the timeout
- [ ] Temp directories are cleaned up in a `finally` block regardless of success/failure
- [ ] Running containers are tracked in a `Map<jobId, containerProcess>` for cancel support
- [ ] The service is injectable via NestJS DI (`@Injectable()`)

## Implementation Notes
- Use `child_process.spawn` for `docker run` to get streaming stdout/stderr. Do NOT use `exec` (buffers everything).
- Container naming convention: `smithy-job-{jobId}` — this allows `cancelJob` to target by name via `docker stop smithy-job-{jobId}`.
- The `--rm` flag auto-removes the container after exit, avoiding zombie containers.
- Mount the temp dir as `--volume /tmp/smithy-job-{jobId}:/input:ro` — read-only prevents Workers from modifying input.
- For timeouts, use `--stop-timeout` on `docker run` and a Node.js `setTimeout` that calls `cancelJob` as a safety net.
- AI provider API keys should be read from the application's environment/config and passed through to the container. Do NOT hardcode keys.
- The `SMITHY_API_KEY` is a per-job ephemeral token generated for the container to authenticate back to the API. This will be implemented in a future auth task — for now, use a placeholder or skip validation.
- Event emission should go through the EventBusService (task 068) when available. For now, use NestJS EventEmitter2 as a local event bus.
