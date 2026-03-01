# Task 010: Create .gitignore and LICENSE

## Summary
Create a comprehensive root `.gitignore` covering all common Node.js, TypeScript, and monorepo artifacts, plus an MIT LICENSE file. This is a hygiene task that prevents build artifacts, secrets, and editor-specific files from being committed to the repository.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 001 (Initialize pnpm Workspace)
- **Blocks**: None directly — this is a hygiene task that should be completed early

## Architecture Reference
The `.gitignore` must account for the full Smithy monorepo structure: multiple Node.js applications, TypeScript compilation output, Turborepo cache, Docker-related files, coverage reports, and environment secrets. The LICENSE file establishes the project's legal terms.

## Files and Folders
- `/.gitignore` — Root gitignore covering all workspace packages and applications
- `/LICENSE` — MIT license file with current year

## Acceptance Criteria
- [ ] `.gitignore` covers `node_modules/` (at any depth)
- [ ] `.gitignore` covers `dist/` and `build/` directories
- [ ] `.gitignore` covers `.env*` files (except `.env.example`)
- [ ] `.gitignore` covers `coverage/` directories
- [ ] `.gitignore` covers `.turbo/` cache directory
- [ ] `.gitignore` covers `.DS_Store` (macOS)
- [ ] `.gitignore` covers `*.log` files
- [ ] `.gitignore` covers IDE directories: `.idea/`, `.vscode/` (except shared settings), `*.swp`, `*.swo`
- [ ] `.gitignore` covers TypeScript build info: `*.tsbuildinfo`
- [ ] `.gitignore` covers Docker volumes and temporary files
- [ ] `LICENSE` is a valid MIT license
- [ ] `LICENSE` contains the current year (2026)

## Implementation Notes
- Use `!.env.example` pattern to explicitly un-ignore example env files.
- Consider also ignoring: `*.tgz` (packed packages), `.pnpm-store/`, `tmp/`, `temp/`.
- For `.vscode/`, a common pattern is to ignore everything except `settings.json` and `extensions.json` if the team shares those.
- The MIT LICENSE should have a placeholder or the project owner's name — use "Smithy AI Contributors" if no specific name is provided.
- This task is intentionally low-risk and can be completed in parallel with other foundation tasks.
