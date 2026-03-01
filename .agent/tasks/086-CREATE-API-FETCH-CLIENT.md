# Task 086: Create Typed API Fetch Client

## Summary
Create a typed fetch-based API client that reads its base URL from `VITE_API_URL`, handles JSON parsing and error responses, and exposes type-safe methods for every backend REST endpoint. This is the single point of contact between the frontend and the API — all TanStack Query hooks call through this client.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 084 (Initialize Vite + React App), 020 (Shared Type Interfaces)
- **Blocks**: 091-101 (all pages consume the API client via TanStack Query hooks)

## Architecture Reference
The API client is a plain TypeScript module (no class instance) that wraps the native `fetch` API. It reads `VITE_API_URL` from `import.meta.env` with a default of `http://localhost:3000/api`. In development, requests to `/api` are proxied by Vite, so the client can use relative URLs. The client returns typed responses using interfaces from `@smithy/shared`. Errors are thrown as a custom `ApiError` class containing the HTTP status code, error message, and optional validation details.

## Files and Folders
- `/apps/web/src/api/client.ts` — API client with typed methods for all REST endpoints, base URL configuration, error handling

## Acceptance Criteria
- [ ] Reads `VITE_API_URL` from `import.meta.env` with fallback to `/api` (relative, for proxied dev)
- [ ] Exports typed methods for Package endpoints: `packages.list(params?)`, `packages.get(id)`, `packages.create(data)`, `packages.update(id, data)`, `packages.delete(id)`
- [ ] Exports typed methods for Worker endpoints: `workers.list(params?)`, `workers.get(slug)`, `workers.create(data)`, `workers.createVersion(slug, data)`
- [ ] Exports typed methods for Assembly Line endpoints: `assemblyLines.list(params?)`, `assemblyLines.get(slug)`, `assemblyLines.create(data)`, `assemblyLines.update(slug, data)`, `assemblyLines.delete(slug)`, `assemblyLines.submitPackage(slug, data)`, `assemblyLines.listPackages(slug, params?)`
- [ ] Exports typed methods for Worker Pool endpoints: `workerPools.list(params?)`, `workerPools.get(slug)`, `workerPools.create(data)`, `workerPools.update(slug, data)`, `workerPools.delete(slug)`, `workerPools.submitPackage(slug, data)`
- [ ] Exports typed methods for Notification endpoints: `notifications.list(params?)`, `notifications.markRead(id)`, `notifications.markAllRead()`
- [ ] Exports typed methods for Job Log endpoints: `jobs.getLogs(jobId, params?)`
- [ ] Exports typed methods for Webhook endpoints: `webhooks.list(params?)`, `webhooks.create(data)`, `webhooks.update(id, data)`, `webhooks.delete(id)`
- [ ] All methods return properly typed response objects using `@smithy/shared` types
- [ ] Throws a custom `ApiError` with `status`, `message`, and optional `details` on non-2xx responses
- [ ] Supports query parameters for pagination (`page`, `limit`) and filtering
- [ ] Sets `Content-Type: application/json` for request bodies
- [ ] Handles `204 No Content` responses without attempting to parse JSON

## Implementation Notes
- Use a simple functional approach with a private `request()` helper that handles fetch, error checking, and JSON parsing. Export namespaced objects (e.g., `export const packages = { list, get, create, ... }`) for clean call sites.
- The `ApiError` class should extend `Error` and include: `status: number`, `message: string`, `details?: Record<string, string[]>` (for validation errors).
- For pagination, the list methods should accept an optional params object like `{ page?: number; limit?: number; sort?: string; filter?: Record<string, string> }` and convert it to URL search params.
- In development, use relative URLs (`/api/packages`) so the Vite proxy handles routing. In production (when `VITE_API_URL` is set to an absolute URL), use the full URL.
- Do NOT add authentication headers yet — auth is not in scope for Phase 5. When auth is added later, the client will need an interceptor to attach Bearer tokens.
- The client should be stateless and tree-shakeable. Avoid creating a class instance.
- Consider adding a `request` abort signal parameter for TanStack Query's automatic cancellation support.
