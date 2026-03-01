# Task 137: Configure Playwright E2E

## Summary
Configure Playwright for end-to-end testing of the Smithy web application. This includes installing browser binaries, setting up the Playwright config with base URL and web server startup commands, and creating shared test fixtures for data seeding and common helpers.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: 084 (Vite React App initialized), 011 (Docker Compose Dev Stack)
- **Blocks**: 138 (Assembly Line E2E Tests), 139 (Interactive Worker E2E Tests), 140 (Factory View E2E Tests)

## Architecture Reference
E2E tests run Playwright (Chromium) against the full Smithy stack: Docker Compose services (Postgres, Redis, RabbitMQ, MinIO) + NestJS API + Vite dev server. The Playwright config orchestrates starting these dependencies via `webServer` configuration. Test fixtures seed data through the API (not direct DB access) to test the complete request path.

The E2E test suite lives in `apps/web/e2e/` following the convention of colocating E2E tests with the frontend app they exercise. Fixtures provide reusable seed data and helper functions shared across all E2E spec files.

## Files and Folders
- `/apps/web/playwright.config.ts` — Playwright configuration (browsers, base URL, web server, timeouts)
- `/apps/web/e2e/fixtures/seed.ts` — Data seeding fixture (creates Workers, Assembly Lines, Worker Pools, Packages via API)
- `/apps/web/e2e/fixtures/helpers.ts` — Common test helpers (login stub, navigation, WebSocket wait)
- `/apps/web/package.json` — Add `@playwright/test` dev dependency and `e2e` script

## Acceptance Criteria
- [ ] `@playwright/test` is installed as a dev dependency in `apps/web`
- [ ] `playwright.config.ts` configures: `baseURL: 'http://localhost:5173'`, browser: chromium, screenshot on failure, video on first retry
- [ ] `webServer` config starts Docker Compose services, API server, and Vite dev server with appropriate readiness checks
- [ ] `seed.ts` fixture exports a `seedTestData` function that creates via API calls: 2 Workers (summarizer, spec-writer), 1 Assembly Line with 2 steps, 1 Worker Pool with 2 members, 1 test Package
- [ ] `helpers.ts` exports: `login()` (stub — no-op in MVP, placeholder for real auth), `navigateTo(page, path)`, `waitForSocket(page, event)` (waits for a Socket.IO event)
- [ ] `pnpm --filter web e2e` runs Playwright tests
- [ ] Playwright browsers can be installed via `pnpm --filter web exec playwright install chromium`
- [ ] Test timeout is configured to 30 seconds (default), with a global setup timeout of 60 seconds for service startup
- [ ] Tests run in serial by default (E2E tests share state) with `workers: 1`

## Implementation Notes
- Playwright config structure:
  ```ts
  import { defineConfig, devices } from "@playwright/test";

  export default defineConfig({
    testDir: "./e2e",
    timeout: 30_000,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    use: {
      baseURL: "http://localhost:5173",
      screenshot: "only-on-failure",
      video: "on-first-retry",
      trace: "on-first-retry",
    },
    projects: [
      { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ],
    webServer: [
      {
        command: "docker compose -f ../../docker/docker-compose.yml up -d",
        timeout: 60_000,
        reuseExistingServer: true,
      },
      {
        command: "pnpm --filter api dev",
        url: "http://localhost:3000/health",
        timeout: 30_000,
        reuseExistingServer: true,
      },
      {
        command: "pnpm --filter web dev",
        url: "http://localhost:5173",
        timeout: 15_000,
        reuseExistingServer: true,
      },
    ],
  });
  ```
- The seed fixture should use `fetch` or a lightweight HTTP client to call the API directly. Do NOT use the Playwright `page` object for seeding — seed data should be created headlessly before tests run.
- The `waitForSocket` helper can use Playwright's `page.evaluate()` to listen for Socket.IO events on `window.__socket__` (assuming the app exposes the socket instance for testing) or use `page.waitForEvent('websocket')`.
- For CI, consider adding `PLAYWRIGHT_BROWSERS_PATH` to cache browser binaries.
- The `login()` helper is a no-op stub in MVP but should accept a user parameter so tests are forward-compatible with real auth.
- Add `e2e-results/`, `playwright-report/`, and `test-results/` to `.gitignore`.
