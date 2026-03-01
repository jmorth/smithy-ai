# Task 001: Initialize pnpm Workspace

## Summary
Initialize the root pnpm workspace with `package.json` and `pnpm-workspace.yaml`, listing `apps/*`, `packages/*`, and `workers/*` as workspace directories. This is the foundational task that enables all other monorepo packages and applications to be discovered, linked, and managed through pnpm's workspace protocol.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: None — this is a root task
- **Blocks**: 002 (Turborepo Pipeline), 003 (TypeScript Base Config), 004 (ESLint Shared Config), 005 (Shared Types Package), 006 (Worker SDK Package), 007 (NestJS API App), 008 (Vite React Web App), 009 (Bun CLI App), 010 (Gitignore and License)

## Architecture Reference
Smithy is an AI agent orchestration framework built as a monorepo using Turborepo + pnpm. The workspace root coordinates all packages and applications:
- `apps/*` — deployable applications (api, web, cli)
- `packages/*` — shared libraries (shared, worker-sdk, eslint-config)
- `workers/*` — individual worker implementations (added later)

## Files and Folders
- `/package.json` — Root workspace package.json with `name: "smithy-ai"`, `private: true`, and common dev scripts
- `/pnpm-workspace.yaml` — Workspace definition listing `apps/*`, `packages/*`, `workers/*`

## Acceptance Criteria
- [ ] `pnpm install` runs without error from the repository root
- [ ] Workspace packages are discoverable via `pnpm ls --recursive` (once child packages exist)
- [ ] Root `package.json` has `"name": "smithy-ai"`
- [ ] Root `package.json` has `"private": true`
- [ ] Root `package.json` has common dev scripts: `dev`, `build`, `lint`, `test`, `typecheck`
- [ ] `pnpm-workspace.yaml` lists `apps/*`, `packages/*`, and `workers/*`
- [ ] Node engine requirement is specified (>=20)
- [ ] pnpm version requirement is specified via `packageManager` field

## Implementation Notes
- Use `"type": "module"` in the root package.json for ESM-first approach.
- The dev scripts should delegate to Turborepo (e.g., `"dev": "turbo dev"`, `"build": "turbo build"`). These will fail until task 002 creates `turbo.json`, which is expected.
- Pin the pnpm version using the `packageManager` field (e.g., `"packageManager": "pnpm@9.15.4"`).
- Include `turbo` as a root dev dependency.
- The `workers/*` workspace entry is forward-looking; no workers exist yet, but the workspace should be ready for them.
