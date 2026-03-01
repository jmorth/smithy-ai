# Task 127: Create Worker Test Command

## Summary
Create the `smithy worker test <path>` command that builds a Worker's Docker image and runs it locally with test input. This provides a local development loop for testing Workers without deploying to the Smithy platform.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 122 (CLI Entry Point — provides command routing), 123 (API Client — for mock endpoint configuration), 125 (Output Helpers — provides spinner and streaming output)
- **Blocks**: None

## Architecture Reference
The test command builds and runs a Worker container locally using Docker CLI commands spawned as subprocesses via `Bun.spawn`. It mounts test input into the container, sets mock environment variables (including a mock `SMITHY_API_URL`), streams stdout/stderr to the terminal, and cleans up the container after the run completes. This is a local-only operation that does not require the Smithy API to be running.

## Files and Folders
- `/apps/cli/src/commands/dev/test.ts` — Command handler for `smithy worker test`

## Acceptance Criteria
- [ ] Accepts a path argument pointing to a Worker directory (defaults to current directory)
- [ ] Validates that the path contains a `Dockerfile` and `worker.yaml`
- [ ] Builds the Docker image from the Worker's Dockerfile (shows build progress via spinner)
- [ ] Reads test input from `--input <file>` flag or stdin
- [ ] Runs the container with mock environment variables: `SMITHY_API_URL=http://host.docker.internal:3000/api`, `SMITHY_WORKER_ENV=test`
- [ ] Streams container stdout and stderr to the terminal in real time
- [ ] Displays the container exit code and final output when the run completes
- [ ] Cleans up (removes) the container after the run, regardless of success or failure
- [ ] Supports `--env <KEY=VALUE>` flag (repeatable) for passing additional environment variables to the container
- [ ] Supports `--timeout <seconds>` flag with a default of 300 seconds (kills container if exceeded)
- [ ] Exit code mirrors the container's exit code: 0 on success, non-zero on failure

## Implementation Notes
- Use `Bun.spawn` to invoke `docker build` and `docker run` as subprocesses. Prefer streaming the output rather than buffering it.
- For `docker run`, use `--rm` to auto-remove on normal exit, but also wrap in a try/finally to ensure cleanup on interrupts (Ctrl+C).
- Test input should be passed to the container via a bind mount or stdin pipe. Bind-mounting a file to a known path (e.g., `/input/data.json`) is simpler and more reliable.
- The `--timeout` flag should use `docker run --stop-timeout` or implement a timer that calls `docker kill` if the container exceeds the limit.
- Check for Docker availability before attempting to build — if `docker` is not in PATH, print a helpful error message.
- The mock `SMITHY_API_URL` uses `host.docker.internal` so the container can reach the host's API server (works on Docker Desktop; on Linux, may need `--network host` or the bridge gateway IP).
- Consider adding `--no-build` flag to skip the build step and use an existing image — useful when iterating on input without changing Worker code.
