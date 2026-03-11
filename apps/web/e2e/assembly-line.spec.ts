import { test, expect } from "@playwright/test";
import { seedTestData } from "./fixtures/seed";
import { login, navigateTo } from "./fixtures/helpers";

/**
 * Assembly Line E2E workflow tests.
 *
 * These tests exercise the core Smithy workflow: create an Assembly Line with
 * two steps, submit a Package, verify it appears in the tracker, and navigate
 * to the Package detail page.
 *
 * Processing-dependent verifications (step progression to step 2, completion)
 * require actual worker containers. Those tests use generous timeouts and will
 * pass once the container orchestration layer is deployed.
 */

test.describe.serial("Assembly Line Workflow", () => {
  test.beforeAll(async () => {
    await seedTestData();
  });

  // -----------------------------------------------------------------------
  // AC: Navigate to Assembly Lines list page and verify it loads
  // -----------------------------------------------------------------------
  test("should navigate to assembly lines list page and verify it loads", async ({
    page,
  }) => {
    await login(page);
    await navigateTo(page, "/assembly-lines");

    // Verify heading
    await expect(
      page.getByRole("heading", { name: "Assembly Lines" }),
    ).toBeVisible();

    // Verify the seeded assembly line appears in the table
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "summarize-then-spec", exact: true }),
    ).toBeVisible();

    // Verify status badge shows "Active"
    await expect(page.getByText("Active").first()).toBeVisible();

    // Verify Create button is present
    await expect(
      page.getByRole("button", { name: /Create Assembly Line/i }),
    ).toBeVisible();

    // Verify table has expected column headers
    await expect(
      page.getByRole("columnheader", { name: /Name/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /Status/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /Steps/i }),
    ).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // AC: Create a new Assembly Line with 2 steps (summarizer → spec-writer)
  // -----------------------------------------------------------------------
  let createdSlug: string;

  test("should create a new assembly line with 2 steps via the UI", async ({
    page,
  }) => {
    await login(page);
    await navigateTo(page, "/assembly-lines/create");

    // Verify create page loaded
    await expect(
      page.getByRole("heading", { name: "Create Assembly Line" }),
    ).toBeVisible();

    // Fill in name
    await page.locator("#al-name").fill("e2e-test-pipeline");

    // Fill in description
    await page
      .locator("#al-description")
      .fill("E2E test pipeline with summarizer and spec-writer");

    // --- Add Step 1: summarizer ---
    await page.getByRole("button", { name: /Add Step/i }).click();

    // Wait for worker selector dialog
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: /Select Worker/i }),
    ).toBeVisible();

    // Select summarizer worker
    await dialog.getByPlaceholder("Search workers...").fill("summarizer");
    await dialog.getByText("summarizer").first().click();

    // Confirm step addition
    await dialog.getByRole("button", { name: /Add Step$/i }).click();
    await expect(dialog).not.toBeVisible();

    // Verify step 1 was added
    await expect(page.getByTestId("step-card-0")).toBeVisible();
    await expect(page.getByTestId("step-card-0")).toContainText(
      "summarizer",
    );

    // --- Add Step 2: spec-writer ---
    await page.getByRole("button", { name: /Add Step/i }).click();
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder("Search workers...").fill("spec-writer");
    await dialog.getByText("spec-writer").first().click();
    await dialog.getByRole("button", { name: /Add Step$/i }).click();
    await expect(dialog).not.toBeVisible();

    // Verify step 2 was added
    await expect(page.getByTestId("step-card-1")).toBeVisible();
    await expect(page.getByTestId("step-card-1")).toContainText(
      "spec-writer",
    );

    // Submit the form
    await page
      .getByRole("button", { name: /^Create Assembly Line$/i })
      .click();

    // Should navigate to the new assembly line detail page
    await page.waitForURL(/\/assembly-lines\/e2e-test-pipeline/);
    createdSlug = "e2e-test-pipeline";

    // Verify detail page loaded with correct name
    await expect(
      page.getByRole("heading", { name: "e2e-test-pipeline" }),
    ).toBeVisible();

    // Verify pipeline shows both steps
    await expect(page.getByTestId("step-1")).toBeVisible();
    await expect(page.getByTestId("step-2")).toBeVisible();

    // Verify Active status badge
    await expect(page.getByText("Active").first()).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // AC: Submit a Package to the Assembly Line via the UI
  // -----------------------------------------------------------------------
  test("should submit a package to the assembly line via the UI", async ({
    page,
  }) => {
    await login(page);
    await navigateTo(page, `/assembly-lines/${createdSlug}`);

    // Click Submit Package button
    await page.getByRole("button", { name: /Submit Package/i }).click();

    // Wait for the submit dialog
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: /Submit Package/i }),
    ).toBeVisible();

    // Verify dialog shows the correct target
    await expect(dialog).toContainText("assembly line");
    await expect(dialog).toContainText(createdSlug);

    // Select package type
    await dialog.locator("#package-type").selectOption("document");

    // Add metadata key/value
    await dialog.getByPlaceholder("Key").first().fill("source");
    await dialog.getByPlaceholder("Value").first().fill("e2e-test");

    // Submit the package
    await dialog.getByRole("button", { name: /^Submit Package$/i }).click();

    // Wait for dialog to close (submission complete)
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  });

  // -----------------------------------------------------------------------
  // AC: Verify the Package appears in step 1 (PROCESSING or IN_TRANSIT)
  // -----------------------------------------------------------------------
  test("should verify the package appears in step 1 with IN_TRANSIT or PROCESSING status", async ({
    page,
  }) => {
    test.slow();
    await login(page);
    await navigateTo(page, `/assembly-lines/${createdSlug}`);

    // Wait for packages section to be visible
    await expect(page.getByText(/Packages/).first()).toBeVisible();

    // The submitted package should appear in the package tracker table
    const table = page.getByRole("table");
    await expect(table).toBeVisible();

    // Verify package row with a status badge (IN_TRANSIT from submit)
    await expect(
      table.getByText(/In Transit|Processing|Pending/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Verify the package type column shows "document"
    await expect(table.getByText("document").first()).toBeVisible();

    // Verify the pipeline step 1 is visible
    await expect(page.getByTestId("step-1")).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // AC: Wait for Package to progress to step 2
  //
  // Requires worker containers to be running. The pipeline visualization
  // updates in real-time via Socket.IO JOB_STATE_CHANGED events.
  // -----------------------------------------------------------------------
  test("should wait for the package to progress to step 2", async ({
    page,
  }) => {
    test.slow();
    await login(page);
    await navigateTo(page, `/assembly-lines/${createdSlug}`);

    // Verify the pipeline visualization is present with both steps
    const step2 = page.getByTestId("step-2");
    await expect(step2).toBeVisible();

    // Wait for step 2 to show Processing or Completed (non-idle status)
    await expect(
      step2.getByText(/Processing|Completed/i),
    ).toBeVisible({ timeout: 120_000 });
  });

  // -----------------------------------------------------------------------
  // AC: Wait for Package to reach COMPLETED status
  // -----------------------------------------------------------------------
  test("should wait for the package to reach COMPLETED status", async ({
    page,
  }) => {
    test.slow();
    await login(page);
    await navigateTo(page, `/assembly-lines/${createdSlug}`);

    // Wait for a package row to show Completed status
    const table = page.getByRole("table");
    await expect(table).toBeVisible();

    await expect(
      table.getByText("Completed", { exact: true }).first(),
    ).toBeVisible({ timeout: 120_000 });

    // Verify step 2 in pipeline shows completed
    const step2 = page.getByTestId("step-2");
    await expect(
      step2.getByText("Completed"),
    ).toBeVisible({ timeout: 10_000 });
  });

  // -----------------------------------------------------------------------
  // AC: Navigate to Package detail page and verify output files are listed
  // -----------------------------------------------------------------------
  test("should navigate to package detail page and verify content", async ({
    page,
  }) => {
    test.slow();
    await login(page);
    await navigateTo(page, `/assembly-lines/${createdSlug}`);

    // Wait for the packages table
    const table = page.getByRole("table");
    await expect(table).toBeVisible();

    // Click the first package ID link to navigate to its detail page
    const packageLink = table.getByRole("link").first();
    await expect(packageLink).toBeVisible();
    const packageIdText = await packageLink.textContent();
    await packageLink.click();

    // Verify we navigated to the package detail page
    await page.waitForURL(/\/packages\//);

    // Verify the Package heading is visible
    await expect(
      page.getByRole("heading", { name: "Package" }),
    ).toBeVisible();

    // Verify package ID is displayed
    const packageId = page.getByTestId("package-id");
    await expect(packageId).toBeVisible();
    // Full ID should contain the truncated ID from the table link
    if (packageIdText) {
      await expect(packageId).toContainText(packageIdText);
    }

    // Verify status badge shows Completed
    await expect(
      page.getByText("Completed").first(),
    ).toBeVisible();

    // Verify status timeline is present with progression dots
    await expect(page.getByTestId("status-timeline")).toBeVisible();
    await expect(page.getByTestId("timeline-dot-PENDING")).toBeVisible();
    await expect(page.getByTestId("timeline-dot-IN_TRANSIT")).toBeVisible();
    await expect(page.getByTestId("timeline-dot-PROCESSING")).toBeVisible();
    await expect(page.getByTestId("timeline-dot-COMPLETED")).toBeVisible();

    // Verify the Completed dot is the active one (Current badge)
    await expect(page.getByText("Current")).toBeVisible();

    // Verify Package Info section
    await expect(page.getByText("Package Info")).toBeVisible();
    await expect(page.getByTestId("created-date")).toBeVisible();
    await expect(page.getByTestId("updated-date")).toBeVisible();

    // Verify assembly line link
    await expect(page.getByTestId("assembly-line-link")).toBeVisible();

    // Verify metadata section (we submitted with source: e2e-test)
    await expect(page.getByText("Metadata")).toBeVisible();
    await expect(page.getByTestId("metadata-table")).toBeVisible();
    await expect(page.getByText("source")).toBeVisible();
    await expect(page.getByText("e2e-test")).toBeVisible();

    // Verify Files section heading
    await expect(page.getByText(/Files \(/)).toBeVisible();

    // Verify Job History section heading
    await expect(page.getByText(/Job History \(/)).toBeVisible();
  });
});
