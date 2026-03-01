# Task 126: Create Worker Scaffold Command

## Summary
Create the `smithy worker scaffold <name>` command that generates Worker boilerplate files from templates. The command prompts for configuration (input types, output type, AI provider, model) and generates a complete Worker directory with `worker.yaml`, `worker.ts`, and `Dockerfile`.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 122 (CLI Entry Point — provides command routing), 125 (Output Helpers — provides spinner and status output)
- **Blocks**: None

## Architecture Reference
The scaffold command is a developer experience feature. It creates a new Worker directory under `workers/<name>/` with three template-generated files. Templates use simple placeholder replacement (e.g., `{{WORKER_NAME}}`, `{{INPUT_TYPES}}`). The generated `worker.ts` extends the `SmithyWorker` base class (task 057) with lifecycle method stubs. The generated `Dockerfile` extends the base Worker Docker image (task 062).

## Files and Folders
- `/apps/cli/src/commands/dev/scaffold.ts` — Command handler for `smithy worker scaffold`
- `/apps/cli/src/templates/worker.yaml.tmpl` — YAML configuration template
- `/apps/cli/src/templates/worker.ts.tmpl` — TypeScript Worker class template
- `/apps/cli/src/templates/Dockerfile.tmpl` — Dockerfile template extending base image

## Acceptance Criteria
- [ ] `smithy worker scaffold <name>` creates a `workers/<name>/` directory in the current working directory
- [ ] Prompts for: Worker name (defaults to `<name>` argument), input types (multi-select from defaults + custom), output type (text input), AI provider (select: anthropic/openai/google), model name (text input with provider-specific default)
- [ ] Generates `workers/<name>/worker.yaml` with filled-in configuration (name, inputTypes, outputType, provider block)
- [ ] Generates `workers/<name>/worker.ts` with a SmithyWorker subclass containing `onReceive` and `onProcess` lifecycle stubs
- [ ] Generates `workers/<name>/Dockerfile` extending the Smithy base Worker image with `COPY` and `CMD` instructions
- [ ] Templates use placeholder replacement: `{{WORKER_NAME}}`, `{{INPUT_TYPES}}`, `{{OUTPUT_TYPE}}`, `{{PROVIDER_NAME}}`, `{{MODEL_NAME}}`, `{{API_KEY_ENV}}`
- [ ] Default input type options: `text`, `image`, `pdf`, `json`, `csv` (plus custom entry)
- [ ] API key environment variable auto-derived from provider: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`
- [ ] Fails with a clear error if the target directory already exists
- [ ] Shows a spinner during file generation and a success message listing created files

## Implementation Notes
- Use `@inquirer/prompts` (or Bun-compatible equivalent) for interactive prompts. The multi-select for input types should allow selecting multiple predefined options and adding custom values.
- Templates are plain text files with `{{PLACEHOLDER}}` markers. Read the template, replace all markers, and write the output. No need for a full template engine.
- The generated `worker.ts` should have meaningful comments in the lifecycle stubs explaining what each method should do — this is the developer's first touchpoint with the Worker SDK.
- The generated `Dockerfile` should follow this structure:
  ```dockerfile
  FROM smithy-worker-base:latest
  WORKDIR /app
  COPY . .
  RUN bun install
  CMD ["bun", "run", "worker.ts"]
  ```
- For provider-specific model defaults: `anthropic` -> `claude-sonnet-4-20250514`, `openai` -> `gpt-4o`, `google` -> `gemini-2.0-flash`.
- The command should work without an API connection — it only generates local files.
- Consider adding a `--no-interactive` flag that accepts all values via command-line flags for CI/scripting use.
