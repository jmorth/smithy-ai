import { test, expect } from "@playwright/test";
import { seedTestData, type SeedData } from "./fixtures/seed";
import { login, navigateTo } from "./fixtures/helpers";

/**
 * Interactive Worker STUCK-flow E2E tests.
 *
 * Validates the full interactive loop:
 *   API → RabbitMQ → Worker → STUCK event → Socket.IO → Frontend display →
 *   User input → Socket.IO → Worker resume → Completion.
 *
 * The spec-writer Worker is configured to always ask a question, ensuring
 * deterministic test behavior. Tests run against the full Docker Compose stack
 * and rely on Socket.IO real-time updates (not polling).
 */

const RUN_ID = Date.now().toString(36);

test.describe.serial("Interactive Worker - STUCK Flow", () => {
  let seed: SeedData;
  let interactiveSlug: string;

  test.beforeAll(async () => {
    seed = await seedTestData();
  });

  // -------------------------------------------------------------------------
  // Step 1: Create an Assembly Line with a single spec-writer step.
  // Using a single spec-writer step guarantees the Worker will ask a question
  // and enter the STUCK state.
  // -------------------------------------------------------------------------
  test("should create an assembly line with a spec-writer worker", async ({
    page,
  }) => {
    test.slow();
    await login(page);
    await navigateTo(page, "/assembly-lines/create");

    // Fill in name and description
    const alName = `interactive-e2e-${RUN_ID}`;
    await page.locator("#al-name").fill(alName);
    await page
      .locator("#al-description")
      .fill("E2E test for interactive STUCK flow with spec-writer");

    // Add spec-writer step
    await page.getByRole("button", { name: /Add Step/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder("Search workers...").fill("spec-writer");
    await dialog.getByText("spec-writer").first().click();
    await dialog.getByRole("button", { name: /Add Step$/i }).click();
    await expect(dialog).not.toBeVisible();

    // Verify step was added
    await expect(page.getByTestId("step-card-0")).toBeVisible();
    await expect(page.getByTestId("step-card-0")).toContainText("spec-writer");

    // Submit the form — capture the detail API response for diagnostics
    interactiveSlug = alName;
    const detailApiPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/assembly-lines/${interactiveSlug}`) &&
        !resp.url().includes("/packages") &&
        resp.request().method() === "GET",
      { timeout: 30_000 },
    );

    await page
      .getByRole("button", { name: /^Create Assembly Line$/i })
      .click();

    // Should navigate to the detail page
    await page.waitForURL(new RegExp(`/assembly-lines/${interactiveSlug}`));

    // Wait for the detail API call and verify it succeeded
    const detailResponse = await detailApiPromise;
    if (detailResponse.status() !== 200) {
      const body = await detailResponse.text();
      throw new Error(
        `Detail API GET /assembly-lines/${interactiveSlug} returned ${detailResponse.status()}: ${body}`,
      );
    }

    // Verify detail page loaded
    await expect(
      page.locator("h2").filter({ hasText: alName }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("step-1")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Step 2: Submit a Package to the Assembly Line via the UI
  // -------------------------------------------------------------------------
  test("should submit a package to the assembly line", async ({ page }) => {
    await login(page);
    await navigateTo(page, `/assembly-lines/${interactiveSlug}`);

    // Click Submit Package
    await page.getByRole("button", { name: /Submit Package/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Select package type
    await dialog.locator("#package-type").selectOption("document");

    // Add metadata
    await dialog.getByPlaceholder("Key").first().fill("source");
    await dialog.getByPlaceholder("Value").first().fill("interactive-e2e");

    // Submit
    await dialog.getByRole("button", { name: /^Submit Package$/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // Step 3: Wait for STUCK state and verify the question appears
  //
  // The spec-writer Worker always asks a clarifying question which triggers
  // the STUCK state. The Package detail page listens on Socket.IO /jobs
  // namespace for JOB_STUCK events and renders the InteractiveResponse
  // component with the question text.
  // -------------------------------------------------------------------------
  test("should navigate to package detail and see the STUCK question", async ({
    page,
  }) => {
    test.slow(); // Multiple async transitions: submit → in-transit → processing → stuck

    await login(page);
    await navigateTo(page, `/assembly-lines/${interactiveSlug}`);

    // Wait for a package row to appear in the tracker table
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("link").first()).toBeVisible({
      timeout: 10_000,
    });

    // Click the package link to navigate to its detail page
    const packageLink = table.getByRole("link").first();
    await packageLink.click();
    await page.waitForURL(/\/packages\//);

    // Verify the Package heading is visible
    await expect(
      page.getByRole("heading", { name: "Package" }),
    ).toBeVisible();

    // Wait for the interactive response component to appear (STUCK state).
    // This is rendered via Socket.IO real-time updates, not polling.
    await expect(page.getByTestId("interactive-response")).toBeVisible({
      timeout: 120_000,
    });

    // Verify the question text is displayed
    const questionPrompt = page.getByTestId("question-prompt");
    await expect(questionPrompt).toBeVisible();
    await expect(questionPrompt).not.toBeEmpty();

    // Verify the "Worker needs your input" heading
    await expect(page.getByText("Worker needs your input")).toBeVisible();

    // Verify the answer input and submit button are present
    await expect(page.getByTestId("answer-input")).toBeVisible();
    await expect(page.getByTestId("submit-answer")).toBeVisible();

    // Verify the submit button is disabled (no answer typed yet)
    await expect(page.getByTestId("submit-answer")).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Step 4: Type an answer and submit it
  //
  // Fills the answer textarea and clicks Submit Answer. The answer is sent
  // via Socket.IO to the /interactive namespace, which stores it in Redis
  // and transitions the job back to RUNNING.
  // -------------------------------------------------------------------------
  test("should type an answer and submit it", async ({ page }) => {
    test.slow();

    await login(page);
    await navigateTo(page, `/assembly-lines/${interactiveSlug}`);

    // Navigate to the package detail page
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    const packageLink = table.getByRole("link").first();
    await expect(packageLink).toBeVisible({ timeout: 10_000 });
    await packageLink.click();
    await page.waitForURL(/\/packages\//);

    // Wait for STUCK state interactive UI
    await expect(page.getByTestId("interactive-response")).toBeVisible({
      timeout: 120_000,
    });

    // Type an answer
    const answerInput = page.getByTestId("answer-input");
    await answerInput.fill("Use TypeScript with strict mode enabled");

    // Verify submit button is now enabled
    await expect(page.getByTestId("submit-answer")).toBeEnabled();

    // Click Submit Answer
    await page.getByTestId("submit-answer").click();

    // Verify the confirmation message appears after submission
    await expect(page.getByTestId("interactive-confirmation")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText("Response submitted successfully"),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Step 5: Verify the Worker resumes (STUCK → RUNNING transition)
  //
  // After the answer is submitted, the interactive response component
  // disappears as the Socket.IO JOB_STATE_CHANGED event fires with a
  // non-STUCK state.
  // -------------------------------------------------------------------------
  test("should verify the worker resumes processing after answer", async ({
    page,
  }) => {
    test.slow();

    await login(page);
    await navigateTo(page, `/assembly-lines/${interactiveSlug}`);

    // Navigate to the package detail page
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    const packageLink = table.getByRole("link").first();
    await expect(packageLink).toBeVisible({ timeout: 10_000 });
    await packageLink.click();
    await page.waitForURL(/\/packages\//);

    // The interactive response should no longer be visible (answer was
    // submitted in the previous test and the worker has resumed).
    // If still stuck with a new question, that's fine — but the original
    // question should have been answered.
    //
    // Wait for the STUCK UI to disappear OR for a job with non-STUCK status.
    // The job-history component shows status badges for each job.
    await expect(page.getByTestId("job-history")).toBeVisible({
      timeout: 30_000,
    });

    // The job should show Running or Completed status (not Stuck)
    await expect(
      page.getByText(/Running|Completed/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  // -------------------------------------------------------------------------
  // Step 6: Verify the Package reaches COMPLETED status
  //
  // After answering all questions, the spec-writer Worker completes and the
  // Package transitions through to COMPLETED.
  // -------------------------------------------------------------------------
  test("should verify the package reaches COMPLETED status", async ({
    page,
  }) => {
    test.slow();

    await login(page);
    await navigateTo(page, `/assembly-lines/${interactiveSlug}`);

    // Navigate to the package detail page
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    const packageLink = table.getByRole("link").first();
    await expect(packageLink).toBeVisible({ timeout: 10_000 });
    await packageLink.click();
    await page.waitForURL(/\/packages\//);

    // Wait for the COMPLETED status in the timeline
    await expect(page.getByTestId("timeline-dot-COMPLETED")).toBeVisible({
      timeout: 120_000,
    });

    // Verify the Completed badge is visible in the header
    await expect(page.getByText("Completed").first()).toBeVisible();

    // Verify the interactive response is gone
    await expect(page.getByTestId("interactive-response")).not.toBeVisible();

    // Verify job history shows a Completed job
    await expect(page.getByTestId("job-history")).toBeVisible();
    await expect(
      page.getByText("Completed", { exact: true }).first(),
    ).toBeVisible();
  });
});
