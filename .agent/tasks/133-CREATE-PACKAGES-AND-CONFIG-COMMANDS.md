# Task 133: Create Packages and Config Commands

## Summary
Create the `smithy packages` list command for viewing Packages and the `smithy config get/set/list` commands for managing CLI configuration. These are the final two command groups that complete the CLI surface area.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 122 (CLI Entry Point — provides command routing), 123 (API Client — for Package listing endpoints), 124 (Config Manager — for config read/write), 125 (Output Helpers — provides table printer and JSON mode)
- **Blocks**: None

## Architecture Reference
The packages command fetches and displays Package data from the API as a formatted table. The config commands provide a CLI interface to the ConfigManager (task 124), allowing users to read, write, and list configuration values stored at `~/.smithy/config.json`.

## Files and Folders
- `/apps/cli/src/commands/ops/packages.ts` — Command handler for `smithy packages`
- `/apps/cli/src/commands/ops/config.ts` — Command handler for `smithy config get/set/list`

## Acceptance Criteria
- [ ] `smithy packages` lists Packages as a table with columns: ID, Type, Status, Workflow (Assembly Line or Pool name), Created
- [ ] `smithy packages --type <type>` filters Packages by type
- [ ] `smithy packages --status <status>` filters Packages by status
- [ ] `smithy packages --json` outputs the raw Package list as JSON
- [ ] Pagination support: `--page <n>` and `--limit <n>` flags (defaults: page=1, limit=20)
- [ ] Shows a spinner while fetching Package data
- [ ] `smithy config set <key> <value>` writes the key-value pair to `~/.smithy/config.json`
- [ ] `smithy config get <key>` reads and prints the value for the given key
- [ ] `smithy config list` displays all config values as a table (Key, Value columns)
- [ ] `smithy config set` validates that the key is a known config key (apiUrl, defaultPackageType, defaultAssemblyLine) — rejects unknown keys with a helpful error
- [ ] `smithy config get` for an unset key shows the default value with a note indicating it is the default
- [ ] `smithy config list` shows the config file path at the top of the output
- [ ] Exit code 0 on success, 1 on errors

## Implementation Notes
- The packages table should truncate long IDs (show first 8 characters of UUID) unless `--json` mode is active.
- The "Workflow" column should show which Assembly Line or Worker Pool the Package is associated with. This may require joining data from the Package response — if the API returns `assemblyLineId` or `workerPoolId`, resolve the name via a separate call or display the ID.
- For `smithy config list`, show the file path as a header line (e.g., `Config file: ~/.smithy/config.json`) followed by the key-value table. This helps users find and manually edit the file if needed.
- The `config set` command should validate both the key and the value format. For `apiUrl`, validate that it looks like a URL (starts with `http://` or `https://`).
- Consider adding `smithy config reset` to restore all defaults — this is a convenience but not required for MVP.
- The packages command date formatting should use a human-friendly relative format (e.g., "2 hours ago") for the table view and ISO 8601 for JSON mode.
- Both commands are straightforward wrappers around the API client and ConfigManager — keep the handler functions thin with minimal logic.
