# Task 046: Create Assembly Line REST Controller

## Summary
Create the `AssemblyLinesController` with REST endpoints for Assembly Line CRUD, package submission, and line monitoring. Wire up the `AssemblyLinesModule` that encapsulates the controller, services (AssemblyLinesService, OrchestratorService), and queue topology. Assembly Lines are the user-facing workflow definition that ties Workers into processing pipelines.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 043 (Assembly Line Service)
- **Blocks**: 047 (Assembly Line Tests)

## Architecture Reference
The Assembly Lines controller uses slugs as URL parameters (consistent with Workers). The submit endpoint is the primary entry point for feeding data into a workflow — it creates a Package and triggers the first processing step. The monitoring endpoint (`GET /:slug/packages`) allows users to see all Packages currently flowing through or completed in a specific Assembly Line. The module sits under `modules/workflows/assembly-lines/` to group workflow-related features.

## Files and Folders
- `/apps/api/src/modules/workflows/assembly-lines/assembly-lines.controller.ts` — REST controller with all Assembly Line endpoints
- `/apps/api/src/modules/workflows/assembly-lines/assembly-lines.module.ts` — Feature module wiring all Assembly Line providers

## Acceptance Criteria
- [ ] `POST /api/assembly-lines` — Creates an assembly line with steps, returns 201; 400 on invalid steps; 409 on slug conflict
- [ ] `GET /api/assembly-lines` — Lists all assembly lines with step count and status, returns 200
- [ ] `GET /api/assembly-lines/:slug` — Returns assembly line with full step details (worker names, version numbers), returns 200; 404 if not found
- [ ] `PATCH /api/assembly-lines/:slug` — Updates name/description/status (pause/resume), returns 200; 404 if not found
- [ ] `DELETE /api/assembly-lines/:slug` — Archives (soft deletes) the assembly line, returns 204; 404 if not found
- [ ] `POST /api/assembly-lines/:slug/submit` — Accepts package data, creates a Package, triggers processing, returns 201 with created Package; 404 if line not found; 400 if line is paused/archived
- [ ] `GET /api/assembly-lines/:slug/packages` — Lists Packages in this assembly line with pagination and status filter, returns 200
- [ ] `:slug` parameter is validated with the same slug pipe as Workers
- [ ] Submit endpoint request body: `{ type: string, metadata?: Record<string, unknown> }` — minimal input to create a Package
- [ ] `AssemblyLinesModule` imports `WorkersModule` (for version validation) and declares all local providers
- [ ] `AssemblyLinesModule` is imported in `AppModule`

## Implementation Notes
- Use `@Controller('assembly-lines')` — the `/api` prefix is added globally.
- The submit endpoint should reject submissions to paused or archived lines with 400 and a clear message.
- For the packages list endpoint, reuse or compose with `PackagesService.findAll()` (from task 032) by passing `assemblyLineId` as a filter. This avoids duplicating pagination logic.
- The `PATCH` endpoint for pausing/resuming should accept `{ status: 'PAUSED' | 'ACTIVE' }`. When paused, the orchestrator should stop advancing Packages to new steps (but in-progress steps should complete). Implementing the pause behavior in the orchestrator is task 044's concern — the controller just updates the status.
- The module should export `AssemblyLinesService` for use by other modules (e.g., the orchestrator in task 044).
- Consider adding a `GET /api/assembly-lines/:slug/status` endpoint that returns real-time statistics: total packages, packages per status, average processing time. This can be deferred to Phase 4 (dashboard) if too complex for MVP.
