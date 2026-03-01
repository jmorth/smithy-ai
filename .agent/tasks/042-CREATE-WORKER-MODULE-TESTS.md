# Task 042: Create Worker Module Tests

## Summary
Write unit tests for `WorkersService` (version auto-increment, slug generation, deprecation logic), `WorkerYamlValidator` (valid and invalid configurations), and integration tests for `WorkersController` (full HTTP request/response cycle). These tests ensure the Worker management subsystem behaves correctly across all operations.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 041 (Worker REST Controller)
- **Blocks**: None directly

## Architecture Reference
Tests follow the same conventions as task 036 (Package tests): unit tests mock the Drizzle client and test service logic in isolation, YAML validator tests are pure function tests, and controller integration tests use Supertest against a real NestJS test application. Worker-specific testing concerns include version immutability enforcement, auto-increment correctness under concurrent scenarios, and YAML validation edge cases.

## Files and Folders
- `/apps/api/src/modules/workers/__tests__/workers.service.spec.ts` — Unit tests for WorkersService
- `/apps/api/src/modules/workers/__tests__/worker-yaml.validator.spec.ts` — Unit tests for YAML validation
- `/apps/api/src/modules/workers/__tests__/workers.controller.spec.ts` — Integration tests for WorkersController

## Acceptance Criteria
- [ ] **Service unit tests**: `createWorker()` generates correct slug from name (various inputs including spaces, special chars, unicode)
- [ ] **Service unit tests**: `createWorker()` throws ConflictException on duplicate slug
- [ ] **Service unit tests**: `createVersion()` auto-increments version number correctly (v1, v2, v3...)
- [ ] **Service unit tests**: `createVersion()` stores yamlConfig as-is in the database
- [ ] **Service unit tests**: `deprecateVersion()` changes status to DEPRECATED; is idempotent
- [ ] **Service unit tests**: `findAll()` includes latest version info per worker
- [ ] **Service unit tests**: `findBySlug()` includes full version history
- [ ] **Service unit tests**: `updateWorker()` regenerates slug on name change; detects conflicts
- [ ] **YAML validator tests**: Valid minimal config (name, inputTypes, outputType, provider) passes
- [ ] **YAML validator tests**: Valid full config (with tools, timeout, retries, systemPrompt) passes
- [ ] **YAML validator tests**: Missing required `name` field fails with specific error
- [ ] **YAML validator tests**: Missing required `provider.model` field fails with specific error
- [ ] **YAML validator tests**: Empty `inputTypes` array fails
- [ ] **YAML validator tests**: Invalid YAML syntax produces clear error message
- [ ] **YAML validator tests**: Extra unknown fields are stripped (or allowed — document the decision)
- [ ] **Controller integration tests**: All 7 endpoints return correct HTTP status codes
- [ ] **Controller integration tests**: Version creation validates YAML and returns 400 on invalid config
- [ ] **Controller integration tests**: Version deprecation returns 200; other version mutations return 400
- [ ] All tests pass when run with `pnpm --filter api test`

## Implementation Notes
- For slug generation tests, create a table of inputs and expected outputs:
  ```
  "My Worker" → "my-worker"
  "  spaces  " → "spaces"
  "already-kebab" → "already-kebab"
  "UPPER_CASE" → "upper-case"
  "special!@#chars" → "specialchars"
  ```
- For version auto-increment, mock the Drizzle query to return different max version values and verify the service correctly computes the next version.
- YAML validator tests should test the `validateWorkerConfig` function directly (no YAML parsing needed) and `validateWorkerYaml` for the full YAML→config pipeline.
- For controller integration tests, mock `WorkersService` to isolate HTTP layer testing from database concerns.
- Consider edge cases: creating a version for a non-existent worker, deprecating an already-deprecated version, updating a worker to a name that would collide with another worker's slug.
