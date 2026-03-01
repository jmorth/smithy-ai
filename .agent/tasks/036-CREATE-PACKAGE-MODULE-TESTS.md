# Task 036: Create Package Module Tests

## Summary
Write comprehensive unit tests for `PackagesService` (with mocked Drizzle client) and integration tests for `PackagesController` (using Supertest against a real NestJS test application). These tests verify CRUD operations, status transition enforcement, file management, and the full HTTP request/response cycle for all package endpoints.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 035 (Package REST Controller)
- **Blocks**: None directly

## Architecture Reference
Tests follow the NestJS testing conventions: unit tests use `Test.createTestingModule()` with mocked providers, integration tests use `Test.createTestingModule()` with real (or in-memory) providers and Supertest for HTTP assertions. The test files live alongside the source in a `__tests__/` directory within the module folder. Drizzle is mocked at the service level by providing a fake `DRIZZLE` token; integration tests may use a real test database or mock the service entirely.

## Files and Folders
- `/apps/api/src/modules/packages/__tests__/packages.service.spec.ts` — Unit tests for PackagesService
- `/apps/api/src/modules/packages/__tests__/packages.controller.spec.ts` — Integration tests for PackagesController
- `/apps/api/src/modules/packages/__tests__/package-status.machine.spec.ts` — Unit tests for status machine (pure function, no DI needed)

## Acceptance Criteria
- [ ] **Service unit tests**: `create()` inserts with PENDING status and returns the record
- [ ] **Service unit tests**: `findAll()` applies filters (type, status, assemblyLineId, date range) and pagination
- [ ] **Service unit tests**: `findById()` returns package with files; throws NotFoundException for missing IDs
- [ ] **Service unit tests**: `update()` calls status machine validation when status field is present
- [ ] **Service unit tests**: `update()` rejects invalid status transitions with BadRequestException
- [ ] **Service unit tests**: `softDelete()` sets deleted_at; throws NotFoundException for missing IDs
- [ ] **Service unit tests**: File operations (presign, confirm, list, delete) delegate to StorageService correctly
- [ ] **Status machine tests**: All valid transitions return `true`
- [ ] **Status machine tests**: All invalid transitions return `false`
- [ ] **Status machine tests**: Same-status transitions are allowed
- [ ] **Status machine tests**: Terminal states have no valid outgoing transitions (except as defined)
- [ ] **Controller integration tests**: All 9 endpoints return correct HTTP status codes
- [ ] **Controller integration tests**: Validation errors return 400 with error details
- [ ] **Controller integration tests**: Missing resources return 404
- [ ] All tests pass when run with `pnpm --filter api test`

## Implementation Notes
- For service unit tests, mock the Drizzle client by providing a jest mock at the `DRIZZLE` injection token. Mock the query builder chain: `db.insert().values().returning()`, `db.select().from().where()`, etc.
- For integration tests, use `@nestjs/testing`'s `Test.createTestingModule()` to create a full NestJS app, then use `supertest(app.getHttpServer())` for HTTP calls. Mock `PackagesService` at the module level to avoid needing a real database.
- Status machine tests are the simplest — import the pure functions and test all transition combinations. Consider using `it.each()` for exhaustive transition matrix testing.
- For file operation tests, mock `StorageService` and verify that `upload`, `delete`, and presigned URL methods are called with correct arguments.
- Ensure mocks are properly reset between tests using `beforeEach` / `afterEach`.
- Consider using a test helper to create valid DTO instances for reuse across tests.
