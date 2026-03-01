# Task 009: Scaffold Bun CLI Application

## Summary
Create the `apps/cli` Bun-based CLI application skeleton with `package.json`, entry point, and command directory structure. This CLI is the developer-facing tool for interacting with Smithy — managing workers, submitting packages, monitoring workflows, and running local development commands.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 001 (Initialize pnpm Workspace), 003 (TypeScript Base Config)
- **Blocks**: 122-133 (all CLI tasks in Phase 7)

## Architecture Reference
The CLI is built on Bun for fast startup and native TypeScript execution. It uses a command/subcommand pattern (similar to `git` or `docker`):
- `smithy dev` — local development commands (start, logs, status)
- `smithy ops` — operational commands (deploy, scale, inspect)
- Additional command groups will be added in Phase 7

The CLI communicates with the Smithy API via HTTP and may also interact with Docker directly for local development workflows.

## Files and Folders
- `/apps/cli/package.json` — Package manifest with `name: "@smithy/cli"`, `bin` field, Bun as runtime
- `/apps/cli/tsconfig.json` — TypeScript config extending `../../tsconfig.base.json`
- `/apps/cli/src/index.ts` — CLI entry point with argument parsing and command routing
- `/apps/cli/src/commands/dev/` — Directory for `dev` subcommands (create with placeholder `index.ts`)
- `/apps/cli/src/commands/ops/` — Directory for `ops` subcommands (create with placeholder `index.ts`)
- `/apps/cli/src/lib/` — Directory for shared CLI utilities (API client, config loader, output formatting)

## Acceptance Criteria
- [ ] `bun apps/cli/src/index.ts --help` prints placeholder help text listing available commands
- [ ] `package.json` has a `"bin"` field pointing to the entry point (e.g., `"smithy": "src/index.ts"`)
- [ ] `package.json` depends on `@smithy/shared` via workspace protocol
- [ ] `package.json` has `"name": "@smithy/cli"`
- [ ] `tsconfig.json` extends `../../tsconfig.base.json`
- [ ] Command directory structure exists: `src/commands/dev/`, `src/commands/ops/`, `src/lib/`
- [ ] Each command directory has a placeholder `index.ts`
- [ ] The entry point handles unknown commands gracefully (prints help or error message)

## Implementation Notes
- Bun natively runs TypeScript, so no build step is needed for development. The `bin` field can point directly to `src/index.ts` with a `#!/usr/bin/env bun` shebang.
- For argument parsing, consider using a lightweight library like `commander`, `yargs`, or `citty`. Alternatively, parse `Bun.argv` / `process.argv` manually for a minimal initial implementation.
- Keep the initial implementation very simple — just enough to parse `--help` and route to command directories.
- Do NOT add Docker, HTTP client, or other runtime dependencies yet — those come in Phase 7.
- The `src/lib/` directory will eventually contain shared utilities like API client wrappers, config file loaders (`~/.smithy/config.json`), and terminal output formatters.
- Set `"type": "module"` in package.json.
