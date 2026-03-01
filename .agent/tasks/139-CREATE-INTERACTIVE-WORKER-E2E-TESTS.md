# Task 139: Create Interactive Worker E2E Tests

## Summary
Create end-to-end Playwright tests for the interactive Worker STUCK flow: submit a Package to an Assembly Line containing a spec-writer Worker, wait for the Worker to enter the STUCK state with a question, answer the question via the UI, and verify the Worker resumes and completes processing.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: 137 (Playwright E2E Configuration), 099 (Package Detail Page with Interactive UI)
- **Blocks**: None

## Architecture Reference
The STUCK state is a key Smithy feature: when a Worker needs human input during processing, it transitions to STUCK and emits a question via Socket.IO. The frontend displays the question in the Package detail page with an input field. When the user submits an answer, it is sent back to the Worker via Socket.IO, and the Worker resumes processing.

This test validates the full interactive loop: API → RabbitMQ → Worker → STUCK event → Socket.IO → Frontend display → User input → Socket.IO → Worker resume → Completion.

## Files and Folders
- `/apps/web/e2e/interactive-worker.spec.ts` — Interactive Worker STUCK flow E2E test suite

## Acceptance Criteria
- [ ] Test: Submit a Package to an Assembly Line with a spec-writer Worker (configured to go STUCK)
- [ ] Test: Wait for the Package to reach STUCK state
- [ ] Test: Verify the question text appears in the Package detail page UI
- [ ] Test: Type an answer into the interactive input field and submit
- [ ] Test: Verify the Worker resumes processing (status transitions from STUCK)
- [ ] Test: Verify the Package reaches COMPLETED status
- [ ] Tests use seed fixtures from task 137 for prerequisite data
- [ ] Tests pass against the full Docker Compose stack
- [ ] Tests validate the Socket.IO real-time update flow (not polling-based)

## Implementation Notes
- Test structure:
  ```ts
  import { test, expect } from "@playwright/test";
  import { seedTestData } from "./fixtures/seed";
  import { login, navigateTo, waitForSocket } from "./fixtures/helpers";

  test.describe("Interactive Worker - STUCK Flow", () => {
    test.beforeAll(async () => {
      await seedTestData();
    });

    test("should handle STUCK state and resume on answer", async ({ page }) => {
      test.slow(); // This test involves multiple async transitions

      await login(page);

      // 1. Submit package to assembly line with spec-writer
      await navigateTo(page, "/assembly-lines/{id}");
      // Submit package via UI

      // 2. Wait for STUCK state
      await expect(page.locator('[data-status="STUCK"]')).toBeVisible({
        timeout: 30_000,
      });

      // 3. Verify question appears
      const questionEl = page.locator('[data-testid="stuck-question"]');
      await expect(questionEl).toBeVisible();
      await expect(questionEl).toContainText(/./); // Has some question text

      // 4. Submit answer
      const answerInput = page.locator('[data-testid="stuck-answer-input"]');
      await answerInput.fill("Use TypeScript with strict mode enabled");
      await page.locator('[data-testid="stuck-answer-submit"]').click();

      // 5. Verify resume and completion
      await expect(page.locator('[data-status="STUCK"]')).not.toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator('[data-status="COMPLETED"]')).toBeVisible({
        timeout: 60_000,
      });
    });
  });
  ```
- The spec-writer Worker must be configured (in the seed data or its Worker definition) to always ask a question — this ensures deterministic test behavior. If the Worker's question is non-deterministic, the seed fixture should configure it with a prompt that guarantees a STUCK state.
- Mark the test as `test.slow()` since it involves multiple async state transitions (submit → STUCK → answer → resume → complete) that may take 30-60 seconds total.
- Use `data-testid` attributes for the STUCK UI elements: `stuck-question`, `stuck-answer-input`, `stuck-answer-submit`. These must be added in the Package detail page (task 099).
- The `data-status` attribute on the Package status badge is the recommended selector for status assertions.
- If Socket.IO updates are delayed, increase the `toBeVisible` timeout rather than adding explicit waits — Playwright's auto-waiting is preferred.
- Consider a cleanup step in `afterAll` or `afterEach` that deletes test Packages to avoid polluting the database for other test suites.
