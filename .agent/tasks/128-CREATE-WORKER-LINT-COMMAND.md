# Task 128: Create Worker Lint Command

## Summary
Create the `smithy worker lint <path>` command that validates a Worker directory for correctness: checks that `worker.yaml` exists and has all required fields, that `worker.ts` exists and exports a SmithyWorker subclass, and that a `Dockerfile` is present. Reports pass/fail per check with descriptive messages.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 122 (CLI Entry Point — provides command routing), 125 (Output Helpers — provides status badges and table output)
- **Blocks**: None

## Architecture Reference
The lint command is a static validation tool for Worker directories. It runs entirely locally without Docker or API access. It performs three categories of checks: YAML validation (schema conformance), TypeScript validation (basic structural checks), and Dockerfile existence. Results are displayed as a checklist with pass/fail indicators.

## Files and Folders
- `/apps/cli/src/commands/dev/lint.ts` — Command handler for `smithy worker lint`

## Acceptance Criteria
- [ ] Accepts a path argument pointing to a Worker directory (defaults to current directory)
- [ ] YAML validation: checks that `worker.yaml` exists and contains required fields: `name`, `inputTypes` (non-empty array), `outputType` (non-empty string), `provider` (object with `name`, `model`, `apiKeyEnv`)
- [ ] TypeScript validation: checks that `worker.ts` exists and contains a class that extends `SmithyWorker` (basic text/regex check, not full type-checking)
- [ ] Dockerfile validation: checks that `Dockerfile` exists
- [ ] Reports each check as pass (green checkmark) or fail (red X) with a descriptive message
- [ ] Summary line: "N/M checks passed" with appropriate color (green if all pass, red if any fail)
- [ ] Exit code 0 if all checks pass, 1 if any check fails
- [ ] `--json` flag outputs results as JSON array of `{ check: string, passed: boolean, message: string }` objects
- [ ] YAML parsing errors are caught and reported as a failed check (not an unhandled crash)

## Implementation Notes
- Use `js-yaml` or `yaml` package to parse `worker.yaml`. Validate the parsed object against the expected schema (required fields, correct types).
- For the TypeScript check, a simple regex or string search for `extends SmithyWorker` is sufficient — full type-checking would require the TypeScript compiler and all dependencies, which is too heavy for a lint command.
- Consider additional optional checks that report warnings (not failures): timeout value within reasonable range (1-3600 seconds), provider name is one of the known providers, model name matches known models for the provider.
- The YAML validation should check field types: `inputTypes` must be an array of strings, `provider` must be an object, `name` must be a non-empty string.
- If the path argument points to a file instead of a directory, print a helpful error explaining that the command expects a Worker directory.
- Keep validation rules easy to extend — use an array of check functions that each return `{ check: string, passed: boolean, message: string }`.
