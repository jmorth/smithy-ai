# Task 038: Create Worker Version Service

## Summary
Create the `WorkersService` with Worker CRUD operations and immutable version management. Each Worker can have multiple versions with auto-incrementing version numbers. YAML configuration is stored as JSONB in the database. Versions are immutable once created — they can only be deprecated, never modified or deleted.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 024 (Database Provider Module), 015 (Worker Schema), 037 (Worker DTOs)
- **Blocks**: 039 (Worker YAML Validation), 040 (Worker Discovery Service), 041 (Worker REST Controller)

## Architecture Reference
The Worker entity has a one-to-many relationship with WorkerVersion. Each version stores the complete worker configuration (parsed from YAML) as a JSONB column, enabling schema evolution without migrations. Version numbers auto-increment per worker (not globally): Worker A can have v1, v2, v3 while Worker B independently has v1, v2. The slug is the primary lookup key for Workers (not the UUID), following the pattern of human-readable identifiers.

## Files and Folders
- `/apps/api/src/modules/workers/workers.service.ts` — Service with Worker CRUD and version management methods

## Acceptance Criteria
- [ ] `createWorker(dto: CreateWorkerDto): Promise<Worker>` — generates slug from name, inserts Worker, returns created record; throws ConflictException if slug already exists
- [ ] `createVersion(slug: string, dto: CreateWorkerVersionDto): Promise<WorkerVersion>` — auto-increments version number per worker, stores `yamlConfig` as JSONB, returns created version
- [ ] Version auto-increment: queries max version number for the worker and adds 1 (handles concurrent creation safely)
- [ ] `findAll(): Promise<Worker[]>` — returns all workers with their latest version info (version number, status, created date)
- [ ] `findBySlug(slug: string): Promise<Worker & { versions: WorkerVersion[] }>` — returns worker with full version history; throws NotFoundException if not found
- [ ] `updateWorker(slug: string, dto: UpdateWorkerDto): Promise<Worker>` — updates name/description; if name changes, slug is regenerated; throws ConflictException on slug collision
- [ ] `deprecateVersion(slug: string, version: number): Promise<WorkerVersion>` — changes version status to DEPRECATED; throws NotFoundException if worker or version not found
- [ ] Versions are immutable — no method exists to update a version's `yamlConfig` or `dockerfile`
- [ ] All queries exclude soft-deleted workers

## Implementation Notes
- For auto-incrementing version numbers, use: `SELECT COALESCE(MAX(version), 0) + 1 FROM worker_versions WHERE worker_id = :workerId`. Consider using a Drizzle transaction to prevent race conditions on concurrent version creation.
- Slug generation utility: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')`. Extract this to a shared utility function.
- For `findAll` with latest version, use a subquery or window function: `ROW_NUMBER() OVER (PARTITION BY worker_id ORDER BY version DESC)`. Alternatively, join on `worker_versions` with a `WHERE version = (SELECT MAX(version) ...)` subquery.
- When updating a worker's name and regenerating the slug, check for slug uniqueness BEFORE updating. Use a transaction to prevent TOCTOU races.
- The `deprecateVersion` method should verify the version is not already deprecated (idempotent) and is not the only active version (warn but allow — a worker with all versions deprecated is effectively disabled).
- Consider adding an `activateVersion` method that sets a "default" version pointer on the Worker. For MVP, the latest non-deprecated version is implicitly the active one.
