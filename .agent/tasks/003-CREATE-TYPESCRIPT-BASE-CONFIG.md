# Task 003: Create TypeScript Base Config

## Summary
Create a root `tsconfig.base.json` with strict TypeScript settings, ESNext target, bundler module resolution, and path aliases for `@smithy/shared` and `@smithy/worker-sdk`. This base config is extended by every workspace package and application, ensuring consistent compiler behavior and cross-package type resolution across the entire monorepo.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 001 (Initialize pnpm Workspace)
- **Blocks**: 005 (Shared Types Package), 006 (Worker SDK Package), 007 (NestJS API App), 008 (Vite React Web App), 009 (Bun CLI App)

## Architecture Reference
All TypeScript packages in the Smithy monorepo extend this base configuration. Path aliases allow `import { ... } from "@smithy/shared"` to resolve correctly during development (IDE support) while the actual resolution at build time is handled by each package's bundler or tsc configuration. The base config sets the strictness floor — individual packages may add to it but should never relax it.

## Files and Folders
- `/tsconfig.base.json` — Root TypeScript configuration with strict settings, path aliases, and modern module resolution

## Acceptance Criteria
- [ ] `strict` mode is enabled (all strict family flags active)
- [ ] `target` is set to `ES2022` or later
- [ ] `module` is set to `ESNext`
- [ ] `moduleResolution` is set to `"bundler"`
- [ ] Path aliases defined: `@smithy/shared` → `packages/shared/src`, `@smithy/worker-sdk` → `packages/worker-sdk/src`
- [ ] `esModuleInterop` is enabled
- [ ] `skipLibCheck` is enabled for build performance
- [ ] `resolveJsonModule` is enabled
- [ ] `declaration` and `declarationMap` are enabled for library packages
- [ ] `sourceMap` is enabled
- [ ] All workspace packages can extend this config via `"extends": "../../tsconfig.base.json"` (or appropriate relative path)

## Implementation Notes
- This file should NOT include `include` or `exclude` arrays — those belong in each package's own `tsconfig.json`.
- Set `"forceConsistentCasingInFileNames": true` for cross-platform safety.
- Set `"isolatedModules": true` for compatibility with esbuild/swc transpilers.
- The path aliases here are primarily for IDE resolution. Actual module resolution in the monorepo is handled by pnpm workspace links and each tool's own resolution (Vite, NestJS CLI, Bun, etc.).
- Consider setting `"noUncheckedIndexedAccess": true` for extra safety on index signatures.
- Use `"lib": ["ES2022"]` (without DOM — apps that need DOM will add it in their own tsconfig).
