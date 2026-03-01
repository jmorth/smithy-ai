# Task 130: Create Package Submit Command

## Summary
Create the `smithy submit <type>` command that submits a Package to an Assembly Line or Worker Pool via the API. Supports file attachments via presigned upload URLs and arbitrary metadata key-value pairs.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 122 (CLI Entry Point — provides command routing), 123 (API Client — for Package creation and submission endpoints), 125 (Output Helpers — provides spinner and status output)
- **Blocks**: None

## Architecture Reference
The submit command is the primary operational entry point for sending work into the Smithy system. It creates a Package via the API, optionally uploads files using presigned URLs, and then submits the Package to a specific Assembly Line or Worker Pool. The flow is: create Package -> upload files (if any) -> submit to line/pool -> display Package ID and status.

## Files and Folders
- `/apps/cli/src/commands/ops/submit.ts` — Command handler for `smithy submit`

## Acceptance Criteria
- [ ] `smithy submit <type>` creates a Package of the given type via `POST /api/packages`
- [ ] `--line <slug>` flag submits the Package to an Assembly Line via `POST /api/assembly-lines/:slug/packages`
- [ ] `--pool <slug>` flag submits the Package to a Worker Pool via `POST /api/worker-pools/:slug/packages`
- [ ] Exactly one of `--line` or `--pool` must be provided (error if both or neither)
- [ ] `--file <path>` flag (repeatable) attaches files: requests presigned URL via `POST /api/packages/:id/files/presign`, uploads file, confirms via `POST /api/packages/:id/files/confirm`
- [ ] `--metadata <key=value>` flag (repeatable) adds metadata key-value pairs to the Package
- [ ] Displays Package ID, type, and submission target on success
- [ ] Shows upload progress via spinner for each file
- [ ] Exit code 0 on success, 1 on API errors
- [ ] Interactive mode: if `--metadata` is not provided and stdin is a TTY, prompts for metadata key-value pairs (enter blank key to finish)
- [ ] `--json` flag outputs the created Package object as JSON

## Implementation Notes
- The file upload flow is three steps per file: (1) request a presigned upload URL from the API, (2) PUT the file contents to the presigned URL, (3) confirm the upload with the API. Show a spinner with the filename during each upload.
- For `--metadata`, parse `key=value` format and collect into a `Record<string, string>`. Validate that each flag value contains an `=` separator.
- The `type` argument is required and should match the Package types known to the system. Consider validating against a known list or accepting any string (since types are extensible).
- If no `--line` or `--pool` flag is provided and `defaultAssemblyLine` is set in config, use that as the default target. Otherwise, error with a message explaining the required flags.
- File paths should be resolved relative to the current working directory. Validate that files exist before starting the submission flow.
- Consider adding a `--dry-run` flag that shows what would be submitted without making API calls — useful for CI scripts.
