# Task 141: Create GitHub Actions CI

## Summary
Create a GitHub Actions CI workflow that triggers on push to `main` and on pull requests. The pipeline installs dependencies, runs linting, type-checking, unit tests, integration tests with Docker Compose services, and E2E tests with Playwright, then uploads test reports and coverage artifacts.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: All test tasks (unit, integration, E2E)
- **Blocks**: 142 (GitHub Actions Deploy Workflow)

## Architecture Reference
Smithy uses a pnpm monorepo managed by Turborepo. The CI pipeline leverages Turbo's task graph to run lint, typecheck, and test tasks across all packages in parallel where possible. Integration tests require running PostgreSQL, Redis, RabbitMQ, and MinIO via Docker Compose. E2E tests require the full stack plus Playwright browsers.

The pipeline is structured in stages: install → lint/typecheck (parallel) → unit tests → integration tests (with services) → E2E tests (with full stack). This ordering ensures fast feedback — syntax and type errors are caught before expensive test runs.

## Files and Folders
- `/.github/workflows/ci.yml` — GitHub Actions CI workflow definition

## Acceptance Criteria
- [ ] Workflow triggers on: push to `main`, pull requests to `main`
- [ ] Uses `pnpm` with `--frozen-lockfile` for reproducible installs
- [ ] Node.js 20 is configured via `actions/setup-node`
- [ ] pnpm is configured via `pnpm/action-setup` with version from `packageManager` field
- [ ] `turbo lint` runs across all packages
- [ ] `turbo typecheck` runs across all packages
- [ ] `turbo test` runs unit and integration tests (with Docker Compose services started)
- [ ] Docker Compose services (Postgres, Redis, RabbitMQ, MinIO) are started before integration tests
- [ ] Playwright E2E tests run with browser installation cached
- [ ] Test reports and coverage artifacts are uploaded via `actions/upload-artifact`
- [ ] pnpm store is cached via `actions/cache` for faster installs
- [ ] Turborepo remote cache is used if `TURBO_TOKEN` secret is configured (optional)
- [ ] Workflow completes in under 15 minutes for a typical PR

## Implementation Notes
- Workflow structure:
  ```yaml
  name: CI

  on:
    push:
      branches: [main]
    pull_request:
      branches: [main]

  concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: true

  jobs:
    lint-and-typecheck:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: "pnpm"
        - run: pnpm install --frozen-lockfile
        - run: pnpm turbo lint
        - run: pnpm turbo typecheck

    test:
      runs-on: ubuntu-latest
      needs: lint-and-typecheck
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: "pnpm"
        - run: pnpm install --frozen-lockfile
        - name: Start Docker Compose services
          run: docker compose -f docker/docker-compose.yml up -d --wait
        - run: pnpm turbo test
        - name: Upload coverage
          uses: actions/upload-artifact@v4
          if: always()
          with:
            name: coverage
            path: "**/coverage/"

    e2e:
      runs-on: ubuntu-latest
      needs: test
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: "pnpm"
        - run: pnpm install --frozen-lockfile
        - name: Install Playwright browsers
          run: pnpm --filter web exec playwright install --with-deps chromium
        - name: Start Docker Compose services
          run: docker compose -f docker/docker-compose.yml up -d --wait
        - name: Start API server
          run: pnpm --filter api dev &
        - name: Start web dev server
          run: pnpm --filter web dev &
        - name: Wait for servers
          run: |
            npx wait-on http://localhost:3000/health http://localhost:5173 --timeout 60000
        - name: Run E2E tests
          run: pnpm --filter web e2e
        - name: Upload Playwright report
          uses: actions/upload-artifact@v4
          if: always()
          with:
            name: playwright-report
            path: apps/web/playwright-report/
  ```
- Use `concurrency` with `cancel-in-progress: true` to cancel stale workflow runs on the same branch.
- The `--wait` flag on `docker compose up` blocks until all health checks pass, replacing manual wait loops.
- For Playwright browser caching, consider using `actions/cache` with key based on the Playwright version:
  ```yaml
  - uses: actions/cache@v4
    with:
      path: ~/.cache/ms-playwright
      key: playwright-${{ hashFiles('apps/web/package.json') }}
  ```
- The `TURBO_TOKEN` and `TURBO_TEAM` secrets enable Turborepo remote caching. Add them as optional — the pipeline should work without them.
- Integration tests may need environment variables for database URLs. Set them in the workflow or ensure they default to Docker Compose values.
- Consider adding a matrix strategy for Node versions if supporting multiple versions is planned (not needed for MVP).
