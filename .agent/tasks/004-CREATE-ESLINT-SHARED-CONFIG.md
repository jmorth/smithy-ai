# Task 004: Create Shared ESLint Configuration Package

## Summary
Create the `@smithy/eslint-config` package providing a shared ESLint flat config with TypeScript and Prettier integration. This centralizes linting rules across the entire monorepo so every package and application enforces the same code style and catches the same categories of errors, reducing config drift and code review friction.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 001 (Initialize pnpm Workspace), 003 (TypeScript Base Config)
- **Blocks**: All packages that import the eslint config (005-009 and beyond)

## Architecture Reference
The `packages/eslint-config` package lives alongside other shared packages in the monorepo. It exports a flat ESLint configuration array that each workspace package references in its own `eslint.config.js`. The config integrates `@typescript-eslint` for type-aware linting and `eslint-config-prettier` to disable style rules that conflict with Prettier.

## Files and Folders
- `/packages/eslint-config/package.json` — Package manifest with `name: "@smithy/eslint-config"`, dependencies on eslint plugins
- `/packages/eslint-config/index.js` — Flat ESLint config export (array of config objects)
- `/packages/eslint-config/tsconfig.json` — TypeScript config extending base (for any TS-aware tooling)

## Acceptance Criteria
- [ ] Package has `"name": "@smithy/eslint-config"` in package.json
- [ ] Exports a flat ESLint configuration (array format, not legacy `.eslintrc` format)
- [ ] Includes `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` for TypeScript support
- [ ] Includes `eslint-config-prettier` to disable conflicting style rules
- [ ] Includes sensible defaults: no unused vars (warn), no explicit any (warn), consistent type imports
- [ ] All workspace packages can reference it as a dev dependency via `"@smithy/eslint-config": "workspace:*"`
- [ ] `pnpm turbo lint` works when packages create their own `eslint.config.js` importing this config
- [ ] Package compiles/loads without error

## Implementation Notes
- Use ESLint v9 flat config format (`export default [...]`). Do NOT use the legacy `.eslintrc` format.
- The `index.js` file can be plain JavaScript since it's a config-only package — no need for TypeScript compilation.
- Include `eslint-plugin-import-x` (or `eslint-plugin-import`) for import ordering and resolution rules if desired.
- Consider providing multiple named exports (e.g., `base`, `react`, `node`) so different app types can pick the right config. At minimum, export a base config suitable for Node/library packages.
- Set `"type": "module"` in package.json so the config file can use ESM imports.
- Each consuming package will create its own `eslint.config.js` that imports and spreads this shared config — do NOT try to auto-discover or configure that from this package.
