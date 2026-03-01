# Task 138: Create Assembly Line E2E Tests

## Summary
Create end-to-end Playwright tests for the Assembly Line workflow: create a new Assembly Line, submit a Package, verify the Package progresses through steps, reaches completion, and displays correct output on the Package detail page.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: 137 (Playwright E2E Configuration), 095 (Assembly Line Detail Page)
- **Blocks**: None

## Architecture Reference
These tests exercise the core Smithy workflow end-to-end: a user creates an Assembly Line with multiple steps, submits a Package into it, and watches the Package flow through each step to completion. This validates the integration between the frontend (React pages, Socket.IO real-time updates), the API (REST endpoints, job dispatch), the message broker (RabbitMQ job queue), and the worker runtime (processing steps).

Tests run against the full Docker Compose stack via the Playwright config from task 137.

## Files and Folders
- `/apps/web/e2e/assembly-line.spec.ts` — Assembly Line E2E test suite

## Acceptance Criteria
- [ ] Test: Navigate to Assembly Lines list page and verify it loads
- [ ] Test: Create a new Assembly Line with 2 steps (summarizer → spec-writer) via the UI
- [ ] Test: Submit a Package to the Assembly Line via the UI
- [ ] Test: Verify the Package appears in step 1 (PROCESSING or IN_TRANSIT status)
- [ ] Test: Wait for and verify the Package progresses to step 2
- [ ] Test: Wait for and verify the Package reaches COMPLETED status
- [ ] Test: Navigate to the Package detail page and verify output files are listed
- [ ] All tests use seed fixtures from task 137 for prerequisite data (Workers exist)
- [ ] Tests pass against the full Docker Compose stack (`pnpm --filter web e2e`)
- [ ] Tests include meaningful assertions (not just "page loads") — verify text content, status badges, navigation

## Implementation Notes
- Test structure:
  ```ts
  import { test, expect } from "@playwright/test";
  import { seedTestData } from "./fixtures/seed";
  import { login, navigateTo } from "./fixtures/helpers";

  test.describe("Assembly Line Workflow", () => {
    test.beforeAll(async () => {
      await seedTestData();
    });

    test("should create a new assembly line", async ({ page }) => {
      await login(page);
      await navigateTo(page, "/assembly-lines");
      // Click create button, fill form, submit
      // Verify new line appears in list
    });

    test("should submit a package and track progression", async ({ page }) => {
      await login(page);
      // Navigate to the assembly line
      // Submit a package
      // Wait for status updates via Socket.IO
      // Verify step progression
    });

    test("should show completed package details", async ({ page }) => {
      await login(page);
      // Navigate to package detail page
      // Verify output files are listed
      // Verify completion status
    });
  });
  ```
- Use `page.waitForSelector()` or `expect(locator).toBeVisible()` with appropriate timeouts for async operations (Package processing can take several seconds).
- For real-time status updates, use `page.waitForSelector('[data-status="COMPLETED"]')` or similar data attribute selectors rather than polling.
- The tests should be ordered: create line → submit package → verify progression → verify detail. Use `test.describe.serial()` if Playwright version supports it, or ensure test order via naming.
- Consider adding `test.slow()` for tests that wait for worker processing, which may exceed the default 30-second timeout.
- Use `data-testid` attributes in the frontend components (from task 095) for reliable selectors that don't break on style changes.
