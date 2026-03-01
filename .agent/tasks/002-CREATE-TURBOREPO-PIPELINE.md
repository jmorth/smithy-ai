# Task 002: Create Turborepo Pipeline

## Summary
Create `turbo.json` defining the build dependency graph so that `shared` builds before `worker-sdk`, and both build before `api`, `web`, and `cli`. Define pipelines for `build`, `lint`, `test`, `typecheck`, and `dev` with appropriate caching and dependency configurations. This ensures correct build ordering and enables Turborepo's remote caching for fast CI.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 001 (Initialize pnpm Workspace)
- **Blocks**: All build-dependent tasks across every phase

## Architecture Reference
Turborepo orchestrates the monorepo build graph. The dependency ordering is:
```
@smithy/shared → @smithy/worker-sdk → apps/api, apps/web, apps/cli
@smithy/eslint-config (standalone, no internal deps)
```
Each pipeline task (`build`, `lint`, `test`, `typecheck`) declares its dependencies and cache inputs/outputs so Turborepo can parallelize independent work and skip unchanged packages.

## Files and Folders
- `/turbo.json` — Turborepo pipeline configuration with task definitions, dependency graph, caching rules, and output declarations

## Acceptance Criteria
- [ ] `pnpm turbo build` respects dependency ordering (`shared` before `worker-sdk` before apps)
- [ ] `pnpm turbo lint` runs across all packages in parallel
- [ ] `pnpm turbo test` runs across all packages
- [ ] `pnpm turbo typecheck` runs across all packages
- [ ] `pnpm turbo dev` starts all dev servers in parallel (persistent task, no caching)
- [ ] Pipeline caching works — second consecutive `pnpm turbo build` with no changes is near-instant (cache hit)
- [ ] `turbo.json` uses the Turborepo v2 schema (`"$schema": "https://turbo.build/schema.json"`)
- [ ] Build outputs (`dist/**`) are declared for cache restoration

## Implementation Notes
- Use the Turborepo v2 configuration format with the `tasks` key (not the deprecated `pipeline` key).
- The `build` task should declare `"dependsOn": ["^build"]` to ensure transitive workspace dependencies build first.
- The `dev` task should be marked `"persistent": true` and `"cache": false`.
- The `lint` and `test` tasks should depend on `"^build"` so type information is available.
- The `typecheck` task should depend on `"^build"` as well for the same reason.
- Configure `outputs` for `build` as `["dist/**"]`.
- Configure appropriate `inputs` globs to avoid unnecessary rebuilds (e.g., exclude test files from build inputs).
