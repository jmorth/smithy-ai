# Task 041: Create Worker REST Controller

## Summary
Create the `WorkersController` with REST endpoints for Worker CRUD and version management, and wire up the `WorkersModule` that ties together the controller, services (WorkersService, WorkerDiscoveryService), and the YAML validator. Workers are looked up by slug (not UUID) in URL paths.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 038 (Worker Version Service), 039 (Worker YAML Validation)
- **Blocks**: 042 (Worker Module Tests)

## Architecture Reference
The Workers controller uses slugs as the primary URL parameter (e.g., `/api/workers/my-cool-worker`) rather than UUIDs, providing human-readable and stable URLs. Version endpoints are nested under the worker slug path. The `WorkersModule` is a feature module imported into `AppModule` that encapsulates all worker-related logic including discovery, YAML validation, and REST API.

## Files and Folders
- `/apps/api/src/modules/workers/workers.controller.ts` — REST controller with worker and version endpoints
- `/apps/api/src/modules/workers/workers.module.ts` — Feature module wiring all worker-related providers

## Acceptance Criteria
- [ ] `POST /api/workers` — Creates a worker, returns 201 with the created worker (including generated slug)
- [ ] `GET /api/workers` — Lists all workers with latest version info, returns 200
- [ ] `GET /api/workers/:slug` — Returns a single worker with full version history, returns 200; 404 if not found
- [ ] `PATCH /api/workers/:slug` — Updates worker name/description, returns 200; 404 if not found; 409 on slug conflict
- [ ] `POST /api/workers/:slug/versions` — Creates a new version (validates YAML config), returns 201; 404 if worker not found; 400 on invalid config
- [ ] `GET /api/workers/:slug/versions/:version` — Returns a specific version, returns 200; 404 if not found
- [ ] `PATCH /api/workers/:slug/versions/:version` — Deprecates a version (only status change allowed), returns 200; 404 if not found
- [ ] `:slug` parameter is validated as a non-empty string matching `[a-z0-9-]+` pattern
- [ ] `:version` parameter is validated as a positive integer
- [ ] `WorkersModule` declares all providers: `WorkersService`, `WorkerDiscoveryService`, YAML validator
- [ ] `WorkersModule` is imported in `AppModule`

## Implementation Notes
- Use `@Controller('workers')` — the `/api` prefix is added globally.
- For slug validation, create a custom `ParseSlugPipe` that validates the format `[a-z0-9]+(-[a-z0-9]+)*` and rejects invalid slugs with 400.
- For version number validation, use `ParseIntPipe` on the `:version` parameter.
- The `POST /api/workers/:slug/versions` endpoint should accept the YAML config as a JSON object in the request body (already parsed from YAML by the client or submitted as raw YAML). Consider accepting both: if `Content-Type: application/x-yaml`, parse it; if `application/json`, use directly. For MVP, JSON-only is fine.
- The `PATCH /api/workers/:slug/versions/:version` endpoint should only accept a `status` field with value `DEPRECATED`. Any other field changes should return 400 since versions are immutable.
- The `WorkersModule` should export `WorkersService` so other modules (like AssemblyLines) can look up worker versions.
