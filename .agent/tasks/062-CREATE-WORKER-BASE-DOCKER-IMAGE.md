# Task 062: Create Worker Base Docker Image

## Summary
Create `Dockerfile.base` for the Worker SDK — a Node 20 Alpine base image with `@smithy/worker-sdk`, Vercel AI SDK packages, and `tsx` pre-installed. The entry point runs the SDK runner. Worker-specific Dockerfiles extend this base image and only need to add their own code and dependencies, keeping individual Worker images small and fast to build.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 061 (Worker SDK Runner — the entry point binary this image executes)
- **Blocks**: 064 (Summarizer Example Worker), 065 (Code Reviewer Example Worker), 066 (Spec Writer Example Worker) — all extend this base image

## Architecture Reference
The base Docker image is the foundation layer for all Worker containers. It provides the Node.js runtime, the Worker SDK (including the runner entry point), AI provider packages, and TypeScript execution support. Worker-specific images use `FROM smithy-worker-base:latest` and add only their `worker.yaml`, `worker.ts`, and any additional npm dependencies. The image expects three volume mounts at runtime: `/config` (YAML), `/worker` (TS class), `/input` (Package files). Alternatively, Worker Dockerfiles can COPY these files directly into the image for self-contained builds.

## Files and Folders
- `/packages/worker-sdk/Dockerfile.base` — Multi-stage Dockerfile building the base Worker image

## Acceptance Criteria
- [ ] Base image: `node:20-alpine`
- [ ] Installs `@smithy/worker-sdk` package (from local workspace or published package)
- [ ] Installs Vercel AI SDK packages: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`
- [ ] Installs `tsx` for TypeScript execution without compilation
- [ ] Installs `yaml` package for YAML config parsing
- [ ] Installs `pino` and `pino-pretty` for structured logging
- [ ] Sets `WORKDIR` to `/app`
- [ ] `ENTRYPOINT` runs the runner via `tsx`: `["npx", "tsx", "/app/node_modules/@smithy/worker-sdk/src/runner.ts"]`
- [ ] Supports volume mounts at `/config` (worker.yaml), `/worker` (worker.ts), and `/input` (Package files)
- [ ] Image builds successfully with `docker build -f Dockerfile.base -t smithy-worker-base:latest .`
- [ ] Image size is under 200MB (Alpine + Node + deps)

## Implementation Notes
- Use a multi-stage build if needed: stage 1 installs dependencies (including devDependencies for building), stage 2 copies only production artifacts.
- For the monorepo setup, the Dockerfile needs access to the worker-sdk package. Options: (a) publish to npm first and install normally, (b) copy the built package into the image context, (c) use `pnpm deploy` to create a standalone bundle. Option (b) is simplest for development.
- The ENTRYPOINT uses `tsx` to run TypeScript directly without a build step. This is slower at startup (~1-2s overhead) but dramatically simplifies the developer experience. For production, consider a compiled variant.
- Do NOT include `pino-pretty` in production — it's for local development only. Use a build arg to conditionally install it: `ARG NODE_ENV=production`.
- Add a `.dockerignore` in the worker-sdk directory to exclude `node_modules`, `__tests__`, and other non-essential files from the build context.
- The image should set `NODE_ENV=production` as a default environment variable.
- Consider adding a healthcheck: `HEALTHCHECK CMD node -e "console.log('ok')"` — this is minimal but confirms Node.js works.
