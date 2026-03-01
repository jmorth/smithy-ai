# Task 047: Create Assembly Line Tests

## Summary
Write unit tests for the Assembly Line orchestrator logic and service layer, plus integration tests for all Assembly Line REST endpoints. These tests verify the core workflow engine: step sequencing, package routing, completion detection, error handling, and the full API surface.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 046 (Assembly Line REST Controller)
- **Blocks**: None directly

## Architecture Reference
Assembly Line tests are the most complex in Phase 2 because they involve multi-service interactions: the service creates lines with validated steps, the orchestrator listens for events and routes packages, and the controller exposes the API. Unit tests isolate each layer with mocks, while integration tests verify the full stack. The orchestrator tests are particularly important — they verify the workflow engine's correctness under various scenarios including happy path, failures, and idempotency.

## Files and Folders
- `/apps/api/src/modules/workflows/assembly-lines/__tests__/assembly-lines.service.spec.ts` — Unit tests for AssemblyLinesService
- `/apps/api/src/modules/workflows/assembly-lines/__tests__/orchestrator.spec.ts` — Unit tests for AssemblyLineOrchestratorService
- `/apps/api/src/modules/workflows/assembly-lines/__tests__/assembly-lines.controller.spec.ts` — Integration tests for AssemblyLinesController

## Acceptance Criteria
- [ ] **Service tests**: `create()` generates correct slug, assigns sequential step numbers starting at 1
- [ ] **Service tests**: `create()` rejects steps referencing non-existent worker versions with BadRequestException
- [ ] **Service tests**: `create()` rejects steps referencing deprecated worker versions
- [ ] **Service tests**: `create()` throws ConflictException on duplicate slug
- [ ] **Service tests**: `findBySlug()` returns full step details with worker name and version
- [ ] **Service tests**: `submit()` creates a Package with status IN_TRANSIT and current_step = 1
- [ ] **Service tests**: `submit()` rejects submission to paused/archived assembly lines
- [ ] **Service tests**: `archive()` soft-deletes the assembly line
- [ ] **Orchestrator tests**: On job.completed for non-final step: advances current_step and publishes to next step queue
- [ ] **Orchestrator tests**: On job.completed for final step: marks Package COMPLETED, emits assembly-line.completed event
- [ ] **Orchestrator tests**: On job.failed: marks Package FAILED with error details
- [ ] **Orchestrator tests**: Idempotency: duplicate completion events for an already-advanced step are ignored without error
- [ ] **Orchestrator tests**: Stale events (current_step > reported step) are logged and skipped
- [ ] **Controller integration tests**: All 7 endpoints return correct HTTP status codes and response shapes
- [ ] **Controller integration tests**: Submit endpoint returns created Package with correct initial status
- [ ] **Controller integration tests**: Invalid step configurations return 400 with descriptive errors
- [ ] All tests pass when run with `pnpm --filter api test`

## Implementation Notes
- For orchestrator tests, mock the RabbitMQ event bus and simulate events by calling the handler methods directly. Verify that the correct messages are published to the correct queues.
- For service tests, mock the Drizzle client and WorkersService (for version validation). Use a factory function to create realistic Assembly Line and step data.
- For controller integration tests, mock AssemblyLinesService at the module level. Test the HTTP layer in isolation from business logic.
- Consider testing the submit→orchestrate→complete flow as an end-to-end scenario in the orchestrator tests: create a 3-step assembly line, submit a package, simulate step 1 completion, verify step 2 is triggered, simulate step 2 completion, verify step 3 is triggered, simulate step 3 completion, verify package is COMPLETED.
- Test edge cases: single-step assembly line (submit should immediately trigger the only step), assembly line with all deprecated worker versions (should not allow submission).
