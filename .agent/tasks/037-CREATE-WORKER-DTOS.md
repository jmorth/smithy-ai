# Task 037: Create Worker DTOs

## Summary
Create Data Transfer Objects for Worker CRUD and version management: `CreateWorkerDto`, `UpdateWorkerDto`, and `CreateWorkerVersionDto`, decorated with `class-validator` constraints. Workers are AI agent definitions — the DTOs capture their name, description, and versioned configuration.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 026 (Global Validation Pipe), 019 (Shared Enums — WorkerStatus)
- **Blocks**: 038 (Worker Version Service)

## Architecture Reference
Workers in Smithy are named AI agent templates, each with one or more immutable versions. The `CreateWorkerDto` captures the worker identity (name, description), while `CreateWorkerVersionDto` captures a specific version's configuration (YAML config stored as JSONB, optional Dockerfile). The worker name is used to auto-generate a URL-safe slug (kebab-case) for routing and identification.

## Files and Folders
- `/apps/api/src/modules/workers/dto/create-worker.dto.ts` — DTO for creating a new worker
- `/apps/api/src/modules/workers/dto/update-worker.dto.ts` — DTO for updating worker metadata
- `/apps/api/src/modules/workers/dto/create-worker-version.dto.ts` — DTO for creating a new worker version
- `/apps/api/src/modules/workers/dto/index.ts` — Barrel export for all DTOs

## Acceptance Criteria
- [ ] `CreateWorkerDto`: `name` is required string (non-empty, max 100 chars), `description` is optional string (max 500 chars)
- [ ] `UpdateWorkerDto`: `name` is optional string (max 100 chars), `description` is optional string (max 500 chars)
- [ ] `CreateWorkerVersionDto`: `yamlConfig` is required (object/JSON — the parsed YAML configuration), `dockerfile` is optional string
- [ ] Worker name auto-generates slug: "My Cool Worker" becomes "my-cool-worker"
- [ ] Slug generation is documented as a service-side concern (not in the DTO), but the DTO validates name format
- [ ] `name` allows alphanumeric characters, spaces, hyphens, and underscores
- [ ] All DTOs have appropriate class-validator decorators
- [ ] All DTOs are exported from the barrel file

## Implementation Notes
- Slug generation happens in the service, not the DTO. The DTO just validates that the name is a reasonable string. Use a utility function like `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')` for slug generation.
- `yamlConfig` in `CreateWorkerVersionDto` is typed as `Record<string, unknown>` at the DTO level. Deep validation of the YAML structure happens in the YAML validator (task 039), not in the DTO. The DTO just ensures it is a valid JSON object.
- Use `@IsObject()` for `yamlConfig` and `@IsOptional() @IsString()` for `dockerfile`.
- Consider adding a `WorkerQueryDto` for the list endpoint with optional filters: `name` (partial match), `status`.
- The `UpdateWorkerDto` should NOT allow changing the slug directly — slug changes are derived from name changes in the service.
