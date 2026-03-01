# Task 142: Create GitHub Actions Deploy Workflow

## Summary
Create a GitHub Actions deployment workflow that triggers after the CI workflow passes on the `main` branch. It builds Docker images for the API, builds the web app as static assets, and deploys both to Railway.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: 141 (GitHub Actions CI Workflow)
- **Blocks**: None

## Architecture Reference
Smithy deploys to Railway for cloud hosting. Railway supports Docker-based deployments for the API (NestJS) and static site deployments for the web frontend (Vite build). The deployment workflow runs only after CI passes on `main`, ensuring that broken code is never deployed.

The workflow uses the Railway CLI (`railway`) to push deployments. Railway manages the infrastructure (PostgreSQL, Redis) as linked services. The deployment is zero-downtime by default on Railway.

## Files and Folders
- `/.github/workflows/deploy.yml` — GitHub Actions deployment workflow definition

## Acceptance Criteria
- [ ] Workflow triggers via `workflow_run` after the CI workflow completes successfully on `main`
- [ ] Builds the API Docker image using the existing Dockerfile from task 028
- [ ] Builds the web app as static assets via `pnpm --filter web build`
- [ ] Deploys to Railway via the Railway CLI
- [ ] Requires `RAILWAY_TOKEN` secret (documented in workflow comments)
- [ ] Includes rollback instructions in workflow comments
- [ ] Deployment only runs when triggered from `main` branch (not PRs)
- [ ] Workflow handles failure gracefully — posts a summary comment or uses GitHub deployment status
- [ ] Environment variables for production are sourced from Railway's environment config (not hardcoded)

## Implementation Notes
- Workflow structure:
  ```yaml
  name: Deploy

  on:
    workflow_run:
      workflows: ["CI"]
      types: [completed]
      branches: [main]

  jobs:
    deploy:
      runs-on: ubuntu-latest
      if: ${{ github.event.workflow_run.conclusion == 'success' }}
      environment: production
      steps:
        - uses: actions/checkout@v4

        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: "pnpm"
        - run: pnpm install --frozen-lockfile

        # Install Railway CLI
        - name: Install Railway CLI
          run: npm install -g @railway/cli

        # Deploy API service
        - name: Deploy API
          env:
            RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
          run: railway up --service api --detach
          # Rollback: railway rollback --service api

        # Build and deploy Web
        - name: Build Web
          run: pnpm --filter web build

        - name: Deploy Web
          env:
            RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
          run: railway up --service web --detach
          # Rollback: railway rollback --service web

    notify-failure:
      runs-on: ubuntu-latest
      if: ${{ github.event.workflow_run.conclusion == 'failure' }}
      steps:
        - name: CI Failed - Skip Deploy
          run: echo "CI workflow failed. Deployment skipped."
  ```
- **Rollback instructions** (include as comments in the workflow file):
  ```
  # To rollback a deployment:
  # 1. Via Railway CLI: railway rollback --service <service-name>
  # 2. Via Railway dashboard: select the service → Deployments → click "Rollback" on the previous deployment
  # 3. Via Git: revert the commit and push to main — CI + deploy will run with the reverted code
  ```
- The `workflow_run` trigger fires after the CI workflow completes. The `if` condition on the `deploy` job checks that CI succeeded — if CI failed, the `notify-failure` job runs instead.
- The `environment: production` setting enables GitHub's deployment protection rules (optional — can require manual approval).
- Railway's CLI reads the project and environment from `railway.toml` (task 144) or from `RAILWAY_TOKEN` which is scoped to a specific project.
- Consider using `railway up --detach` to avoid blocking the workflow while Railway builds and deploys.
- For the web app, Railway can serve static files via its built-in static hosting or the output can be deployed to a CDN. The Railway config (task 144) determines the approach.
- Do NOT hardcode any production environment variables in this workflow. All secrets and config are managed in Railway's environment settings.
