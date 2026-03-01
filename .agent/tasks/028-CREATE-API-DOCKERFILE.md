# Task 028: Create API Dockerfile

## Summary
Create a multi-stage Dockerfile for the API application that produces a minimal, secure production image. The build follows three stages: dependency installation, TypeScript compilation, and a lean runtime image with only production dependencies and compiled JavaScript.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 022 (Bootstrap NestJS Application)
- **Blocks**: 011 (Docker Compose — the `api` service uses this Dockerfile)

## Architecture Reference
The API Dockerfile must work within the Turborepo monorepo context. Since the API app may reference workspace packages (`@smithy/shared`, `@smithy/worker-sdk`), the Docker build context needs to be the monorepo root (or use a Turborepo prune strategy). The final image runs the compiled NestJS application with Node.js 20 on Alpine Linux for minimal image size.

## Files and Folders
- `/apps/api/Dockerfile` — Multi-stage Dockerfile for the API application
- `/apps/api/.dockerignore` — Docker ignore file to exclude unnecessary files from build context

## Acceptance Criteria
- [ ] Dockerfile uses multi-stage build with at least 3 stages: `deps` (install dependencies), `build` (compile TypeScript), `runtime` (production image)
- [ ] Base image is `node:20-alpine` for all stages
- [ ] Final runtime image contains only production dependencies (no devDependencies, no TypeScript source)
- [ ] Final image runs as a non-root user (security best practice)
- [ ] `EXPOSE 3000` instruction is present
- [ ] `HEALTHCHECK` instruction is present, hitting `GET /health`
- [ ] Image builds successfully with `docker build -f apps/api/Dockerfile -t smithy-api .` from the monorepo root
- [ ] `.dockerignore` excludes `node_modules`, `.git`, `*.md`, `dist`, `.env*`, coverage directories
- [ ] Built image starts and responds on port 3000
- [ ] Image size is under 300MB

## Implementation Notes
- Use Turborepo's `turbo prune --scope=api --docker` approach for optimal layer caching:
  - Stage 1 (`deps`): Copy pruned `package.json` files and lockfile, run `pnpm install --frozen-lockfile`
  - Stage 2 (`build`): Copy source, run `pnpm --filter api build`
  - Stage 3 (`runtime`): Copy compiled output and production node_modules
- Alternatively, a simpler approach that copies the full monorepo and builds works for MVP but produces larger images.
- Install pnpm in the Docker image: `corepack enable && corepack prepare pnpm@9.15.4 --activate` (match the version from root `package.json`).
- The non-root user can be created with: `RUN addgroup -S smithy && adduser -S smithy -G smithy` then `USER smithy`.
- Set `NODE_ENV=production` in the runtime stage.
- The HEALTHCHECK instruction: `HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1`.
- Use `wget` instead of `curl` for healthcheck since Alpine has `wget` built in but not `curl`.
- Consider setting `PNPM_HOME` and adding it to `PATH` in the image.
