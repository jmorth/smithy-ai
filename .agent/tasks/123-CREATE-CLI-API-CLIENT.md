# Task 123: Create CLI API Client

## Summary
Create a typed, fetch-based API client for CLI use that reads the API base URL from configuration, supports all backend REST endpoints, and returns typed responses using `@smithy/shared` types. This is the single HTTP interface between the CLI and the Smithy API.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 122 (CLI Entry Point — establishes the CLI runtime), 020 (Shared Type Interfaces — provides response types), 124 (Config Manager — provides API URL resolution)
- **Blocks**: 126-133 (all commands that call the API use this client)

## Architecture Reference
The API client is a plain TypeScript module at `apps/cli/src/lib/api-client.ts`. It wraps the native `fetch` API, reads its base URL from `~/.smithy/config.json` (via the ConfigManager) or the `SMITHY_API_URL` environment variable, and exposes namespaced method groups matching the backend REST endpoints. All methods return typed responses using interfaces from `@smithy/shared`.

## Files and Folders
- `/apps/cli/src/lib/api-client.ts` — Typed API client with methods for all backend REST endpoints

## Acceptance Criteria
- [ ] Reads API URL from `SMITHY_API_URL` environment variable (takes precedence) or falls back to `~/.smithy/config.json` `apiUrl` field
- [ ] Default base URL is `http://localhost:3000/api` when neither env var nor config is set
- [ ] Exports namespaced method groups:
  - `packages.list(params?)` — `GET /api/packages` with pagination/filter query params
  - `packages.get(id)` — `GET /api/packages/:id`
  - `packages.create(data)` — `POST /api/packages`
- [ ] Exports Worker methods:
  - `workers.list(params?)` — `GET /api/workers`
  - `workers.get(slug)` — `GET /api/workers/:slug`
- [ ] Exports Assembly Line methods:
  - `assemblyLines.list(params?)` — `GET /api/assembly-lines`
  - `assemblyLines.get(slug)` — `GET /api/assembly-lines/:slug`
  - `assemblyLines.submit(slug, data)` — `POST /api/assembly-lines/:slug/packages`
- [ ] Exports Worker Pool methods:
  - `workerPools.list(params?)` — `GET /api/worker-pools`
  - `workerPools.get(slug)` — `GET /api/worker-pools/:slug`
  - `workerPools.submit(slug, data)` — `POST /api/worker-pools/:slug/packages`
- [ ] Exports Job methods:
  - `jobs.getLogs(jobId, params?)` — `GET /api/jobs/:jobId/logs`
- [ ] All methods return properly typed response objects using `@smithy/shared` types
- [ ] Throws a custom `CliApiError` with `status`, `message`, and optional `details` on non-2xx responses
- [ ] Sets `Content-Type: application/json` for request bodies
- [ ] Handles `204 No Content` responses without attempting JSON parsing
- [ ] Supports query parameters for pagination (`page`, `limit`) and filtering

## Implementation Notes
- Use a functional approach with a private `request<T>(method, path, options?)` helper that handles fetch, error checking, and JSON parsing. Export namespaced objects for clean call sites: `export const packages = { list, get, create }`.
- The `CliApiError` class should extend `Error` and include: `status: number`, `message: string`, `details?: Record<string, string[]>` (for validation errors from the API).
- For list endpoints, accept an optional params object like `{ page?: number; limit?: number; sort?: string; filter?: Record<string, string> }` and serialize it to URL search params.
- Resolve the base URL lazily on first request (not at import time) so that config file changes take effect without restarting.
- This client is CLI-specific and does NOT need to be tree-shakeable or support abort signals — unlike the web client (task 086), it runs in a short-lived Bun process.
- Do NOT add authentication headers yet — auth is not in scope for the CLI MVP.
