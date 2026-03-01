# Task 131: Create Status Command

## Summary
Create the `smithy status` command that displays the status of Assembly Lines and Worker Pools, including Package positions, Worker states, and queue depths. Supports filtering by specific line or pool, or showing a summary of all.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 122 (CLI Entry Point — provides command routing), 123 (API Client — for status endpoints), 125 (Output Helpers — provides table printer, status badges, and spinner)
- **Blocks**: None

## Architecture Reference
The status command is the primary monitoring tool in the CLI. It fetches status data from the API and renders it as formatted tables with colored status indicators. Three modes: single Assembly Line detail, single Worker Pool detail, or summary of all lines and pools.

## Files and Folders
- `/apps/cli/src/commands/ops/status.ts` — Command handler for `smithy status`

## Acceptance Criteria
- [ ] `smithy status` (no flags) shows a summary table of all Assembly Lines and Worker Pools with columns: Name, Type (line/pool), Status, Active Packages, Queue Depth
- [ ] `smithy status --line <slug>` shows Assembly Line detail: step progression table with columns: Step #, Worker Name, Current Package ID, Status
- [ ] `smithy status --pool <slug>` shows Worker Pool detail: members table with columns: Worker Name, Active Jobs, Queue Depth, Status
- [ ] Status values are color-coded using `statusBadge`: active/healthy = green, stuck/pending = yellow, error/failed = red
- [ ] Shows a loading spinner while fetching data from the API
- [ ] `--json` flag outputs the raw API response as JSON instead of formatted tables
- [ ] `--watch` flag re-fetches and re-renders every N seconds (default 5, configurable via `--interval <seconds>`)
- [ ] Handles API errors gracefully (e.g., 404 for unknown slug shows "Assembly Line not found" message)
- [ ] Exit code 0 on success, 1 on API errors

## Implementation Notes
- The summary view requires two API calls: `assemblyLines.list()` and `workerPools.list()`. Fetch them in parallel with `Promise.all` for faster response.
- For the `--watch` mode, clear the terminal and re-render the table on each refresh. Use `console.clear()` or ANSI escape codes. Handle Ctrl+C to cleanly exit the watch loop.
- The Assembly Line detail view maps each step to its Worker and shows the Package currently being processed at that step (if any). This may require fetching additional data beyond the basic Assembly Line GET endpoint — check the API response shape.
- For the Worker Pool detail view, each member row shows the Worker name, how many jobs are actively running on that member, and how many Packages are queued.
- Consider adding a `--no-color` flag for environments where ANSI colors are problematic (though chalk should handle TTY detection automatically).
- The `--watch` interval should have a minimum of 1 second to avoid overwhelming the API.
