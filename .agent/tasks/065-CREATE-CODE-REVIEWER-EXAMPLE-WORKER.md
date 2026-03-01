# Task 065: Create Code Reviewer Example Worker

## Summary
Create the code-reviewer example Worker — accepts `CODE` Packages, outputs `CODE` Packages with review comments and suggestions. This Worker demonstrates tool use by defining a file-reading tool that the AI model can invoke to examine specific source files, showcasing the Vercel AI SDK's tool calling capabilities.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 062 (Worker Base Docker Image — Dockerfile extends the base)
- **Blocks**: None

## Architecture Reference
The code-reviewer Worker is a mid-complexity example that demonstrates tool use. Unlike the summarizer (task 064), this Worker defines tools that the AI model can call during generation. The file-reading tool allows the model to request specific files from the input Package, simulating an interactive code review where the reviewer can "look at" files as needed. The output is a `CODE` Package containing the review feedback as markdown plus any suggested code changes.

## Files and Folders
- `/workers/examples/code-reviewer/worker.yaml` — Worker configuration with tool definitions
- `/workers/examples/code-reviewer/worker.ts` — Worker implementation with tool-augmented AI calls
- `/workers/examples/code-reviewer/Dockerfile` — Extends `smithy-worker-base:latest`

## Acceptance Criteria
- [ ] `worker.yaml` defines: `name: "code-reviewer"`, `slug: "code-reviewer"`, `inputTypes: ["CODE"]`, `outputType: "CODE"`, tools configured
- [ ] `worker.ts` exports a class extending `SmithyWorker`
- [ ] Defines a `readFile` tool using Vercel AI SDK's tool definition format — accepts a filename parameter, returns file contents from the input Package
- [ ] `onProcess` calls `generateText` with the code review system prompt and the `readFile` tool available
- [ ] The AI model can invoke `readFile` multiple times during a single generation to examine different source files
- [ ] The system prompt instructs the model to review for: correctness, style, security, performance, and maintainability
- [ ] Output Package contains: `review.md` (human-readable review) and optionally `suggestions.patch` (unified diff format of suggested changes)
- [ ] `Dockerfile` extends base image, copies worker files
- [ ] Docker image builds successfully

## Implementation Notes
- Vercel AI SDK tool definition example:
  ```typescript
  const readFileTool = tool({
    description: 'Read the contents of a source file from the input package',
    parameters: z.object({ filename: z.string().describe('Path to the file to read') }),
    execute: async ({ filename }) => context.inputPackage.getFileAsString(filename),
  });
  ```
- The system prompt should include the list of available files (from `context.inputPackage.listFiles()`) so the model knows what it can request.
- Consider adding a `listFiles` tool as well, so the model can discover files dynamically rather than relying on the prompt.
- The review output should be structured markdown with sections per file reviewed, including line-specific comments where applicable.
- Keep the Dockerfile identical to the summarizer pattern — only COPY the worker-specific files.
- This example demonstrates that Workers can extend AI capabilities with custom tools while staying within the standard lifecycle.
