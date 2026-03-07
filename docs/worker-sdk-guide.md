# Worker SDK Guide

The `@smithy/worker-sdk` package provides the base classes and utilities for building custom AI workers. Workers are TypeScript classes that process packages through AI models and produce output packages.

## Worker Lifecycle

Every worker extends `SmithyWorker` and follows this lifecycle:

```
onReceive(pkg) → onProcess(context) → onComplete(output)
                                     ↘ onError(error)
```

| Hook | Signature | Required | Purpose |
|------|-----------|----------|---------|
| `onReceive` | `(pkg: Package) => Promise<void>` | Yes | Validate the input package before processing |
| `onProcess` | `(context: WorkerContext) => Promise<PackageOutput>` | Yes | Main processing logic — read input, call AI, build output |
| `onComplete` | `(output: PackageOutput) => Promise<void>` | No | Post-processing after successful output (default: logs success) |
| `onError` | `(error: Error) => Promise<void>` | No | Error handling (default: logs and re-throws) |

## WorkerContext

The `WorkerContext` is injected into `onProcess` and provides everything a worker needs:

| Property | Type | Description |
|----------|------|-------------|
| `jobId` | `string` | Unique job execution ID |
| `packageId` | `string` | Input package ID |
| `ai` | `LanguageModelV3` | AI model instance (Vercel AI SDK) |
| `inputPackage` | `InputPackage` | Read-only access to input files |
| `outputBuilder` | `OutputBuilder` | Fluent builder for constructing output |
| `logger` | `WorkerLogger` | Structured logger (info, warn, error, debug) |
| `askQuestion()` | `(question, options?) => Promise<string>` | Human-in-the-loop interaction (pauses job until answered) |

### InputPackage

```typescript
inputPackage.listFiles()              // string[] — all files in the input
inputPackage.getFileAsString(name)    // string — read file as UTF-8
inputPackage.getFile(name)            // Buffer — read file as binary
inputPackage.getMetadata()            // Record<string, unknown>
```

### OutputBuilder

Uses a fluent builder pattern. `setType()` must be called before `build()`.

```typescript
outputBuilder
  .setType('SPECIFICATION')
  .addFile('result.md', content, 'text/markdown')
  .setMetadata('model', 'claude-sonnet-4-20250514')
  .build()  // → PackageOutput
```

### askQuestion (Human-in-the-Loop)

Workers can pause execution to ask a human operator a question:

```typescript
const answer = await context.askQuestion('Which format should the output use?', {
  choices: ['JSON', 'YAML', 'Markdown'],  // optional predefined choices
  timeout: 300_000,                        // optional, default 5 minutes
});
```

The job transitions to `STUCK` state while waiting. The operator answers via the web UI or WebSocket. Throws `QuestionTimeoutError` if no answer is received.

## Worker Configuration (worker.yaml)

Each worker requires a `worker.yaml` file defining its identity and AI provider:

```yaml
name: "summarizer"
slug: "summarizer"
inputTypes:
  - "USER_INPUT"
outputType: "SPECIFICATION"
provider:
  name: "anthropic"                    # anthropic | openai | google
  model: "claude-sonnet-4-20250514"    # model identifier
  apiKeyEnv: "ANTHROPIC_API_KEY"       # env var holding the API key
```

### Supported AI Providers

| Provider | `name` | Example Models | SDK |
|----------|--------|---------------|-----|
| Anthropic | `anthropic` | `claude-sonnet-4-20250514`, `claude-haiku-4-5-20251001` | `@ai-sdk/anthropic` |
| OpenAI | `openai` | `gpt-4o`, `gpt-4o-mini` | `@ai-sdk/openai` |
| Google | `google` | `gemini-2.0-flash` | `@ai-sdk/google` |

All providers return a `LanguageModelV3` instance compatible with the Vercel AI SDK functions (`generateText`, `streamText`, `generateObject`, etc.).

## Example: Summarizer Worker

A complete worker that summarizes text files using Claude:

**`worker.yaml`**:

```yaml
name: "summarizer"
slug: "summarizer"
inputTypes:
  - "USER_INPUT"
outputType: "SPECIFICATION"
provider:
  name: "anthropic"
  model: "claude-sonnet-4-20250514"
  apiKeyEnv: "ANTHROPIC_API_KEY"
```

**`worker.ts`**:

```typescript
import { generateText } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { Package, WorkerContext, PackageOutput } from '@smithy/shared';
import { SmithyWorker } from '@smithy/worker-sdk';

const SYSTEM_PROMPT = `You are a document summarizer. Given the input text, produce a structured summary with three sections:

## Overview
2-3 sentences describing the main topic and purpose of the document(s).

## Key Points
A bullet list of the most important points from the text.

## Action Items
A bullet list of any action items, next steps, or recommendations found in the text. If none are found, state "No action items identified."`;

export class SummarizerWorker extends SmithyWorker {
  override async onReceive(pkg: Package): Promise<void> {
    this.logger?.info('Summarizer received package', { packageId: pkg.id });
    if (!pkg.id) throw new Error('Package must have an ID');
  }

  override async onProcess(context: WorkerContext): Promise<PackageOutput> {
    const { inputPackage, outputBuilder, logger } = context;

    const allFiles = inputPackage.listFiles();
    if (allFiles.length === 0) throw new Error('Input package contains no files');

    // Read all text files
    const contents: string[] = [];
    for (const filename of allFiles) {
      const text = inputPackage.getFileAsString(filename);
      contents.push(`--- ${filename} ---\n${text}`);
    }

    // Call the AI model
    const model = context.ai as LanguageModelV3;
    const { text: summary } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: contents.join('\n\n'),
    });

    logger.info('Summary generated', {
      sourceFiles: allFiles.length,
      summaryLength: summary.length,
    });

    // Build and return the output package
    return outputBuilder
      .setType('SPECIFICATION')
      .addFile('summary.md', summary, 'text/markdown')
      .setMetadata('sourceFiles', allFiles.length)
      .setMetadata('model', 'claude-sonnet-4-20250514')
      .setMetadata('generatedAt', new Date().toISOString())
      .build();
  }
}
```

## Creating a New Worker

1. Create a directory under `workers/examples/` (or your own workers directory):

   ```
   workers/examples/my-worker/
   ├── worker.yaml
   └── worker.ts
   ```

2. Define your worker configuration in `worker.yaml`.

3. Implement your worker class in `worker.ts`, extending `SmithyWorker`.

4. The runner resolves the worker class by checking exports in this order: `default` export, named `Worker` export, or the first exported class.

### Runner Environment

When executing inside a container, the runner expects:

| Path / Variable | Purpose |
|----------------|---------|
| `/config/worker.yaml` | Worker configuration |
| `/worker/worker.ts` | Worker implementation |
| `/input/` | Input files directory |
| `SMITHY_JOB_ID` | Job execution ID |
| `SMITHY_PACKAGE_ID` | Input package ID |
| `SMITHY_WORKER_ID` | Worker ID |
| `SMITHY_API_URL` | API base URL for callbacks |
| `SMITHY_API_KEY` | Authentication key |
| `SMITHY_PACKAGE_METADATA` | JSON string of package metadata (optional) |
| Provider API key env var | e.g., `ANTHROPIC_API_KEY` (as specified in worker.yaml) |

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Runtime error |
| `2` | Invalid worker (doesn't extend SmithyWorker) |
| `124` | Timeout |
