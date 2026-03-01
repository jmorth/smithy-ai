# Task 040: Create Worker Discovery Service

## Summary
Create the `WorkerDiscoveryService` that scans the `workers/` directory on application startup, reads `worker.yaml` and optional `Dockerfile` from each subdirectory, and automatically registers or updates Workers and their versions in the database. This enables a file-driven workflow where adding a new worker directory is sufficient to make it available in the system.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 038 (Worker Version Service)
- **Blocks**: 064-066 (Example Workers — they rely on discovery to register)

## Architecture Reference
The `workers/` directory at the monorepo root is a workspace member (configured in task 001). Each subdirectory represents a Worker definition containing at minimum a `worker.yaml` file and optionally a `Dockerfile` for custom container builds. The discovery service runs at application startup via NestJS's `OnModuleInit` lifecycle hook, scanning the directory and synchronizing its contents with the database. If a worker's YAML has changed since the last registered version, a new version is created automatically.

## Files and Folders
- `/apps/api/src/modules/workers/worker-discovery.service.ts` — Service implementing OnModuleInit for startup scanning

## Acceptance Criteria
- [ ] Implements `OnModuleInit` — runs automatically when the Workers module initializes
- [ ] Scans a configurable workers directory (default: `workers/` relative to the monorepo root, configurable via `WORKERS_DIR` env var)
- [ ] For each subdirectory containing a `worker.yaml` file:
  - Parses and validates the YAML using the validator from task 039
  - Reads the `Dockerfile` if present (as a string)
  - Checks if a Worker with the derived slug already exists in the database
  - If new: creates the Worker and its first version (v1)
  - If existing: compares the YAML config hash with the latest version; if changed, creates a new version
- [ ] Logs all discovered Workers at startup with name, slug, and version number (info level)
- [ ] Handles missing or invalid `worker.yaml` files gracefully — logs a warning and skips the directory, does not crash
- [ ] Handles an empty or missing workers directory gracefully — logs a warning, does not crash
- [ ] Config hash comparison uses a deterministic JSON serialization to detect changes

## Implementation Notes
- Use Node.js `fs/promises` (`readdir`, `readFile`, `stat`) for filesystem operations. Check for directory existence before scanning.
- For change detection, compute a SHA-256 hash of the JSON-stringified (with sorted keys) YAML config and compare it to a hash stored on the latest version. If hashes differ, a new version is warranted. Consider storing the config hash as a column on `worker_versions` or computing it on the fly.
- The workers directory path should resolve relative to `process.cwd()` or a configurable base path. In Docker, this might be different from local development — make it configurable.
- Inject `WorkersService` to handle the actual create/update operations. The discovery service should NOT access Drizzle directly — it delegates to the service layer.
- Consider adding a `--no-discovery` flag or `DISABLE_WORKER_DISCOVERY=true` env var for environments where automatic scanning is not desired (e.g., testing).
- Race condition consideration: if multiple API instances start simultaneously, they may both try to create the same Worker. The slug uniqueness constraint in the database will prevent duplicates — catch the conflict and treat it as a no-op.
