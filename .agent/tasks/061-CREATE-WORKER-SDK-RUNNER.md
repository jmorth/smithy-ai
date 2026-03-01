# Task 061: Create Worker SDK Runner

## Summary
Create the runner entry point (`runner.ts`) — the main process inside Worker containers that loads YAML configuration, dynamically imports the user-authored Worker class, creates the `WorkerContext` with all dependencies, and orchestrates the lifecycle hooks in order: `onReceive` then `onProcess` then `onComplete` (or `onError` on failure). This is the executable that the Docker ENTRYPOINT invokes.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 057 (SmithyWorker Base Class), 058 (Worker Execution Context), 059 (Worker SDK API Client), 060 (Worker AI Provider Wrapper)
- **Blocks**: 062 (Base Docker Image — sets runner as entry point), 063 (Worker SDK Tests — tests runner orchestration), 064-066 (Example Workers — run via the runner)

## Architecture Reference
The runner is the top-level orchestrator inside every Worker container. It is the Docker ENTRYPOINT target. On startup, it reads the Worker's YAML config from `/config/worker.yaml` (volume-mounted), dynamically imports the Worker's TypeScript class from `/worker/worker.ts` (volume-mounted), constructs the full runtime context (API client, AI provider, input files, logger), and executes the lifecycle. The runner owns the process exit code: exit 0 for success, exit 1+ for failure. It catches uncaught exceptions and unhandled rejections to ensure the container always exits cleanly with an appropriate code.

## Files and Folders
- `/packages/worker-sdk/src/runner.ts` — Main entry point: YAML loading, dynamic import, context construction, lifecycle orchestration, process exit

## Acceptance Criteria
- [ ] Reads Worker YAML config from `/config/worker.yaml` (mounted by container manager)
- [ ] Dynamically imports Worker TypeScript class from `/worker/worker.ts` (mounted by container manager)
- [ ] Creates `SmithyApiClient` from `SMITHY_API_URL` and `SMITHY_API_KEY` environment variables
- [ ] Creates AI provider instance from YAML config using `AiProvider` wrapper
- [ ] Creates `WorkerContext` with: AI provider, input Package files (from `/input` mount), output builder, Pino logger, API client
- [ ] Calls lifecycle hooks in strict order: `onReceive(inputPackage)` → `onProcess(context)` → `onComplete(output)`
- [ ] On `onProcess` success: submits output Package to API via client, calls `onComplete`, exits with code 0
- [ ] On any error: calls `onError(error)`, reports error to API via client, exits with code 1
- [ ] Catches uncaught exceptions via `process.on('uncaughtException')` — logs, reports to API, exits with code 1
- [ ] Catches unhandled promise rejections via `process.on('unhandledRejection')` — logs, reports to API, exits with code 1
- [ ] Updates job status via API client at each lifecycle stage: RUNNING → PROCESSING → COMPLETED/FAILED

## Implementation Notes
- For YAML parsing, use the `yaml` npm package (lightweight, no native dependencies). Install it as a dependency of the worker-sdk.
- Dynamic import: use `await import('/worker/worker.ts')` or `require` depending on the module system. Since the base image uses `tsx` for TypeScript execution, dynamic `import()` should work for `.ts` files.
- The runner should validate the imported module exports a class that extends `SmithyWorker`. If not, log a descriptive error and exit with code 2 (distinct from runtime errors).
- The input Package is read from `/input` directory. The runner constructs a `Package` object from the files found there plus metadata from environment variables.
- Use `tsx` (TypeScript Execute) as the runtime instead of compiling to JS first — this simplifies the container setup and supports dynamic imports of `.ts` files.
- The runner should log its startup sequence (YAML loaded, Worker imported, context created) at info level for debugging container issues.
- Set a global timeout from the YAML config (`timeout` field) using `setTimeout` — if the Worker exceeds it, kill the process with exit code 124 (matching Unix `timeout` convention).
