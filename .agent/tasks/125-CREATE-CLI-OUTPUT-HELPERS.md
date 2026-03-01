# Task 125: Create CLI Output Helpers

## Summary
Create output helper utilities for the CLI: a formatted ASCII table printer, a progress spinner wrapper, colored status indicators, and a JSON output mode. These utilities provide consistent, user-friendly terminal output across all CLI commands.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 122 (CLI Entry Point — provides the `--json` global flag)
- **Blocks**: 126-133 (all commands use output helpers for display)

## Architecture Reference
The output helpers live at `apps/cli/src/lib/output.ts` and are imported by every command handler. They abstract away the details of terminal formatting (chalk for colors, ora for spinners) and provide a consistent interface. The `--json` global flag toggles machine-readable output mode, where commands emit raw JSON instead of formatted tables and colored text.

## Files and Folders
- `/apps/cli/src/lib/output.ts` — Output utilities: table printer, spinner, status badges, JSON formatter

## Acceptance Criteria
- [ ] `printTable(headers: string[], rows: string[][])` — prints a formatted ASCII table to stdout with column alignment
- [ ] `spinner(text: string)` — returns an `ora` spinner instance (start/stop/succeed/fail methods)
- [ ] `statusBadge(status: string)` — returns colored text: green for active/completed/healthy, yellow for pending/stuck/processing, red for error/failed/dead
- [ ] `formatJson(data: unknown)` — returns pretty-printed JSON string (2-space indent)
- [ ] `printJson(data: unknown)` — writes pretty-printed JSON to stdout (convenience wrapper)
- [ ] Supports `--json` flag detection: when active, `printTable` outputs JSON array of objects (using headers as keys) instead of ASCII table
- [ ] `isJsonMode()` — checks whether `--json` flag is set (reads from process.argv or a shared state set by the entry point)
- [ ] Table columns auto-size to content width with a minimum padding of 2 spaces between columns
- [ ] Spinner suppressed in JSON mode (returns a no-op spinner that does nothing)
- [ ] Colors suppressed when stdout is not a TTY (non-interactive environments like CI)

## Implementation Notes
- Use `chalk` for colored output and `ora` for spinners. Both are well-maintained and work with Bun.
- For the table printer, consider using `cli-table3` or implementing a simple column formatter manually. A manual implementation keeps dependencies minimal and gives full control over formatting.
- The `statusBadge` function should normalize the input to lowercase before matching. Unknown statuses should render in the default terminal color.
- For `--json` mode detection, check `process.argv.includes('--json')` or accept a module-level setter called from the entry point. The latter is cleaner but adds coupling.
- Colors should be suppressed when `process.stdout.isTTY` is false — chalk handles this automatically via its `level` detection, but verify this works in Bun.
- Do NOT import `commander` or other CLI-framework-specific code into this module — it should be framework-agnostic so it can be tested independently.
- Consider adding an `error(message: string)` function that prints to stderr in red — useful for all commands.
