# Task 058: Create Worker Execution Context

## Summary
Create the `WorkerContext` class that provides Worker authors with access to the AI client, input Package file access methods, an output builder for constructing result Packages, a structured logger, and an `askQuestion()` method for interactive Workers that need human input. This is the primary interface Workers interact with during `onProcess`.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 057 (SmithyWorker Base Class — context is passed to lifecycle hooks), 059 (Worker SDK API Client — context uses it for API calls), 060 (Worker AI Provider Wrapper — context holds the AI instance)
- **Blocks**: 061 (Worker SDK Runner — constructs the context), 063 (Worker SDK Tests — tests context behavior)

## Architecture Reference
The `WorkerContext` is constructed by the runner (task 061) and passed to the Worker's `onProcess` hook. It aggregates all runtime capabilities a Worker needs: AI model access (Vercel AI SDK), input file reading, output file building, structured logging (Pino to stdout), and interactive question/answer flow. The context reads configuration from environment variables injected by the container manager (task 053). The `askQuestion()` method communicates with the API via the SDK's REST client (task 059) to implement the STUCK state pattern.

## Files and Folders
- `/packages/worker-sdk/src/context.ts` — `WorkerContext` class with AI, input, output, logger, and interactive capabilities

## Acceptance Criteria
- [ ] `ai` property: configured Vercel AI SDK provider instance (from task 060) with `generateText`, `streamText`, `generateObject` methods available
- [ ] `inputPackage` property: object with file access methods — `getFile(name): Buffer`, `getFileAsString(name): string`, `listFiles(): string[]`, `getMetadata(): Record<string, unknown>`
- [ ] `outputBuilder` property: builder pattern object — `addFile(name, content)`, `setMetadata(key, value)`, `setType(packageType)`, `build(): PackageOutput`
- [ ] `logger` property: structured JSON logger (Pino instance) that writes to stdout — supports `info`, `warn`, `error`, `debug` levels with metadata support
- [ ] `askQuestion(question: string, options?: { choices?: string[], timeout?: number }): Promise<string>` — sends question to API (enters STUCK state), polls for answer with exponential backoff, returns the answer string
- [ ] `jobId` and `packageId` properties read from `SMITHY_JOB_ID` and `SMITHY_PACKAGE_ID` environment variables
- [ ] Context is constructed by the runner with all dependencies injected (not self-constructing from env)

## Implementation Notes
- The `inputPackage` reads files from the `/input` mount point inside the container. Use `fs.readFileSync` for simplicity — Workers process one Package at a time, so synchronous reads are acceptable and avoid complexity.
- The `outputBuilder` accumulates files and metadata in memory. The `build()` method returns a `PackageOutput` object that the runner sends to the API via the SDK client. Consider adding validation (e.g., output type must be set).
- The `askQuestion` flow: (1) call API client's `submitQuestion(jobId, question, options)` which sets the job to STUCK state, (2) poll `awaitAnswer(jobId, questionId)` with backoff until an answer is received, (3) return the answer. If timeout is exceeded, throw a `QuestionTimeoutError`.
- The logger should include `jobId` and `workerId` as default context fields on every log entry. Use Pino's child logger pattern: `pino({ base: { jobId, workerId } })`.
- Do not make the constructor public — expose a static factory method or let the runner construct it. This prevents Workers from accidentally creating contexts with wrong configuration.
- The AI property type should be the Vercel AI SDK's provider interface so Workers can call `generateText({ model: context.ai, prompt: '...' })` or access it via the bound methods.
