# Task 064: Create Summarizer Example Worker

## Summary
Create the summarizer example Worker — a minimal, non-interactive Worker that accepts `USER_INPUT` Packages, produces `SPECIFICATION` Packages, and uses a simple AI text summarization prompt. This serves as the canonical "hello world" example for Worker SDK development, demonstrating the core lifecycle without advanced features like tools or interactive questions.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 062 (Worker Base Docker Image — Dockerfile extends the base), 040 (Worker Discovery — discovers this Worker from its YAML)
- **Blocks**: None

## Architecture Reference
Example Workers live in `/workers/examples/{name}/` and consist of three files: `worker.yaml` (configuration), `worker.ts` (implementation extending `SmithyWorker`), and `Dockerfile` (extending the base image). The summarizer is the simplest possible Worker: it reads text input, sends it to an AI model with a summarization prompt, and creates an output Package with the summary. No tools, no interactive questions, no multi-step processing.

## Files and Folders
- `/workers/examples/summarizer/worker.yaml` — Worker configuration: name, input/output types, AI provider settings
- `/workers/examples/summarizer/worker.ts` — Worker implementation extending `SmithyWorker`
- `/workers/examples/summarizer/Dockerfile` — Extends `smithy-worker-base:latest`, copies worker files

## Acceptance Criteria
- [ ] `worker.yaml` defines: `name: "summarizer"`, `slug: "summarizer"`, `inputTypes: ["USER_INPUT"]`, `outputType: "SPECIFICATION"`, `provider: { name: "anthropic", model: "claude-sonnet-4-20250514", apiKeyEnv: "ANTHROPIC_API_KEY" }`
- [ ] `worker.ts` exports a class extending `SmithyWorker`
- [ ] `onReceive` validates that the input Package contains at least one text file
- [ ] `onProcess` reads all input text files, calls `generateText` with a summarization system prompt, creates an output Package with the summary as a markdown file
- [ ] The AI prompt instructs the model to produce a structured summary with: overview, key points, and action items
- [ ] `Dockerfile` uses `FROM smithy-worker-base:latest`, copies `worker.yaml` to `/config/` and `worker.ts` to `/worker/`
- [ ] The Docker image builds successfully: `docker build -t smithy-worker-summarizer:latest ./workers/examples/summarizer/`
- [ ] Worker runs successfully in a container with mock input files mounted at `/input`

## Implementation Notes
- Keep the summarization prompt concise but structured. Example system prompt: "You are a document summarizer. Given the input text, produce a structured summary with three sections: Overview (2-3 sentences), Key Points (bullet list), and Action Items (if any)."
- The `onReceive` hook should check that at least one file exists and that the files are text-based (not binary). Log a warning for binary files and skip them.
- The output Package should contain a single file: `summary.md` with the AI-generated summary.
- Set output metadata: `{ sourceFiles: number, model: string, generatedAt: string }`.
- This Worker does NOT use tools or `askQuestion` — it is intentionally simple. Tasks 065 and 066 demonstrate those features.
- The Dockerfile should be minimal — the base image already has everything needed. Just COPY the config and worker files.
