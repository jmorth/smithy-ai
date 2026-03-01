# Task 005: Scaffold Shared Types Package

## Summary
Create the `@smithy/shared` package skeleton with `package.json`, `tsconfig.json`, an empty `src/index.ts` barrel export, and the directory structure for types, events, and constants. This package is the single source of truth for all cross-package TypeScript types, enums, and event contracts used throughout the Smithy monorepo.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 001 (Initialize pnpm Workspace), 003 (TypeScript Base Config)
- **Blocks**: 019 (Shared Enums and Constants), 020 (Shared Type Interfaces), 021 (Event Type Contracts), 022+ (backend modules consume these types)

## Architecture Reference
`@smithy/shared` sits at the bottom of the dependency graph — every other package and application depends on it. It contains only TypeScript types, interfaces, enums, and constants. It must be isomorphic (no Node-specific or browser-specific imports) so it can be consumed by the NestJS API, the React web app, the Bun CLI, and worker processes alike.

## Files and Folders
- `/packages/shared/package.json` — Package manifest with `name: "@smithy/shared"`, main/types entry points
- `/packages/shared/tsconfig.json` — TypeScript config extending `../../tsconfig.base.json`
- `/packages/shared/src/index.ts` — Barrel export file (initially empty or with placeholder comment)
- `/packages/shared/src/types/` — Directory for type interface files (created empty with `.gitkeep` or placeholder `index.ts`)
- `/packages/shared/src/events/` — Directory for event type contracts (created empty with placeholder `index.ts`)
- `/packages/shared/src/constants/` — Directory for enums and constants (created empty with placeholder `index.ts`)

## Acceptance Criteria
- [ ] Package has `"name": "@smithy/shared"` in package.json
- [ ] `tsconfig.json` extends `../../tsconfig.base.json`
- [ ] Package compiles with `tsc --noEmit` (or `tsc -b`) without errors
- [ ] Exports from `@smithy/shared` resolve in other workspace packages that declare it as a dependency
- [ ] Directory structure exists: `src/types/`, `src/events/`, `src/constants/`
- [ ] Each subdirectory has a placeholder `index.ts` for future barrel exports
- [ ] `src/index.ts` re-exports from `./types`, `./events`, `./constants` (even if those are empty)
- [ ] `package.json` specifies `"main"`, `"types"`, and `"exports"` fields pointing to source (for workspace consumption)

## Implementation Notes
- For workspace-internal packages, point `"main"` and `"types"` directly at `src/index.ts` rather than `dist/` — this allows other packages to consume the source directly during development without a build step. If a build step is desired, use `tsup` or `tsc` and point to `dist/`.
- Set `"type": "module"` in package.json.
- The `exports` field should use the `"."` entry with `"import"` and `"types"` conditions.
- Do NOT add runtime dependencies — this package should have zero dependencies (only devDependencies for TypeScript).
- Placeholder `index.ts` files in subdirectories can simply be `export {};` to satisfy TypeScript.
