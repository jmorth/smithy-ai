# Task 140: Create Factory View E2E Tests

## Summary
Create end-to-end Playwright tests for the Phaser factory visualization: verify the canvas loads without errors, verify visual elements render when an active workflow exists, and verify that clicking on canvas elements opens the React overlay panels.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: 137 (Playwright E2E Configuration), 102 (Phaser React Wrapper), 120 (Overlay Panels)
- **Blocks**: None

## Architecture Reference
The factory view is a Phaser 3 game canvas embedded in the React app via the wrapper from task 102. It renders an isometric factory floor showing Assembly Lines, Workers, and Packages as sprites. Clicking on sprites opens React overlay panels (from task 120) that display details and controls.

Phaser canvas testing with Playwright is inherently limited — Playwright cannot inspect individual sprites rendered on a `<canvas>` element. Tests focus on integration correctness: the canvas loads, no JavaScript errors occur, and the overlay panel system works when coordinates are clicked.

## Files and Folders
- `/apps/web/e2e/factory-view.spec.ts` — Factory view E2E test suite

## Acceptance Criteria
- [ ] Test: Navigate to `/factory` and verify the page loads
- [ ] Test: Verify a `<canvas>` element exists in the DOM
- [ ] Test: Verify no console errors occur during canvas initialization
- [ ] Test: Seed an active workflow and verify the canvas has rendered (canvas is not blank — check via screenshot comparison or pixel sampling)
- [ ] Test: Click on a known coordinate area on the canvas and verify that a React overlay panel appears
- [ ] Test: Verify the overlay panel contains expected content (Worker or Assembly Line details)
- [ ] Test: Close the overlay panel and verify it disappears
- [ ] Tests pass against the full Docker Compose stack

## Implementation Notes
- Test structure:
  ```ts
  import { test, expect } from "@playwright/test";
  import { seedTestData } from "./fixtures/seed";
  import { login, navigateTo } from "./fixtures/helpers";

  test.describe("Factory View", () => {
    test.beforeAll(async () => {
      await seedTestData();
    });

    test("should load the Phaser canvas without errors", async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      await login(page);
      await navigateTo(page, "/factory");

      const canvas = page.locator("canvas");
      await expect(canvas).toBeVisible();
      expect(consoleErrors).toHaveLength(0);
    });

    test("should render factory elements with active workflow", async ({ page }) => {
      await login(page);
      await navigateTo(page, "/factory");

      // Wait for Phaser to finish loading
      await page.waitForTimeout(2000);

      // Take a screenshot and verify canvas is not blank
      const canvas = page.locator("canvas");
      const screenshot = await canvas.screenshot();
      expect(screenshot.byteLength).toBeGreaterThan(1000); // Non-trivial content
    });

    test("should open overlay panel on canvas click", async ({ page }) => {
      await login(page);
      await navigateTo(page, "/factory");

      await page.waitForTimeout(2000); // Allow Phaser to render

      // Click a known area where a sprite should exist
      const canvas = page.locator("canvas");
      await canvas.click({ position: { x: 400, y: 300 } });

      // Verify overlay panel appears
      const overlay = page.locator('[data-testid="factory-overlay-panel"]');
      await expect(overlay).toBeVisible({ timeout: 5000 });

      // Close the panel
      await page.locator('[data-testid="overlay-close-button"]').click();
      await expect(overlay).not.toBeVisible();
    });
  });
  ```
- **Canvas testing limitations**: Playwright cannot query Phaser sprites or game objects directly. The tests verify:
  1. The canvas element exists and is visible
  2. No JavaScript errors during initialization (common failure mode for Phaser)
  3. The canvas has rendered non-trivial content (screenshot byte size check)
  4. Click-to-overlay integration works
- The canvas click coordinates (e.g., `{ x: 400, y: 300 }`) must correspond to where the seed data's entities are rendered. This may require the Phaser game to expose sprite positions to the test environment or use fixed layout positions for known entities.
- Consider using `page.evaluate()` to query the Phaser game instance directly if the app exposes `window.__phaserGame__`:
  ```ts
  const sceneCount = await page.evaluate(() =>
    (window as any).__phaserGame__?.scene?.scenes?.length
  );
  expect(sceneCount).toBeGreaterThan(0);
  ```
- Use `page.waitForTimeout()` sparingly — it is needed here because Phaser initialization is async and not observable via DOM changes.
- Screenshot comparison (`toMatchSnapshot()`) is an option for regression testing but is fragile for initial implementation. Prefer the byte-size check for now.
- Add `data-testid="factory-overlay-panel"` and `data-testid="overlay-close-button"` to the overlay components in task 120.
