# Task 122: Create CLI Entry Point

## Summary
Create the CLI entry point with argument parsing and command routing using the `smithy <category> <action>` structure. This wires up commander (or manual argv parsing) to dispatch to command handlers, prints usage on `--help`, and handles version display and unrecognized commands gracefully.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 009 (Scaffold Bun CLI App — provides package.json, tsconfig, directory structure)
- **Blocks**: 123-133 (all CLI commands depend on the entry point for routing)

## Architecture Reference
The CLI is a Bun-based workspace package at `apps/cli/`. Commands follow the pattern `smithy <category> <action>` — for example, `smithy worker scaffold` or `smithy config set`. The entry point parses arguments, registers all top-level commands and their subcommands, and delegates to the appropriate handler module. Exit codes follow Unix convention: 0 for success, 1 for errors.

## Files and Folders
- `/apps/cli/src/index.ts` — CLI entry point with argument parsing, command registration, and routing

## Acceptance Criteria
- [ ] `bun apps/cli/src/index.ts --help` prints usage text listing all available commands
- [ ] Top-level commands registered: `worker` (subcommands: scaffold, test, lint, build), `submit`, `status`, `logs`, `packages`, `config`
- [ ] `--version` flag prints the version from `package.json`
- [ ] Unrecognized commands display the help text and exit with code 1
- [ ] Exit codes: 0 on success, 1 on error
- [ ] `worker` command group has subcommands: `scaffold`, `test`, `lint`, `build`
- [ ] `config` command group has subcommands: `get`, `set`, `list`
- [ ] Each command stub imports from its handler module (placeholders are acceptable until those tasks are completed)
- [ ] Shebang line `#!/usr/bin/env bun` is present at the top of the file

## Implementation Notes
- Use `commander` for argument parsing — it handles help generation, version flags, nested subcommands, and error handling out of the box. Alternatively, `citty` is a lighter option if commander feels heavy.
- Keep the entry point thin: register commands and options, then delegate to handler functions imported from `src/commands/dev/` and `src/commands/ops/`.
- Command handlers that don't exist yet should be stubbed as functions that print "Not implemented" and exit with code 0 — the real implementations arrive in tasks 126-133.
- The `worker` group nests under `smithy worker <action>`, while `submit`, `status`, `logs`, and `packages` are top-level commands (not nested under a group).
- Consider adding a global `--json` flag that downstream commands can check to switch output mode. This flag is consumed by the output helpers (task 125).
- Bun natively runs TypeScript, so no build step is required for development.
