# Worker Execution Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the `WorkerContext` class that provides Worker authors with AI client access, input Package file methods, an output builder, structured logger, and `askQuestion()` for interactive Workers.

**Architecture:** The `WorkerContext` is constructed by the runner (task 061) and passed to `onProcess`. It aggregates AI model access, input file reading from `/input` mount, output file building, Pino structured logging, and interactive Q&A via the API client. Dependencies are injected — the context never self-constructs from env.

**Tech Stack:** TypeScript, Pino (structured logging), Vitest (testing), Node.js fs (file I/O)

---

### Task 1: Update Shared WorkerContext Interface

**Files:**
- Modify: `packages/shared/src/types/worker-context.ts`

Update the `WorkerContext` interface to match the task 058 spec: `ai`, `inputPackage`, `outputBuilder`, `logger`, `askQuestion()`, `jobId`, `packageId`. Add `InputPackage`, `OutputBuilder`, `QuestionOptions` interfaces.

### Task 2: Add Pino Dependency

**Files:**
- Modify: `packages/worker-sdk/package.json`

Add `pino` as a runtime dependency.

### Task 3: Implement InputPackage

**Files:**
- Create: `packages/worker-sdk/src/input-package.ts`
- Create: `packages/worker-sdk/src/input-package.test.ts`

Reads files from `/input` mount. Methods: `getFile(name): Buffer`, `getFileAsString(name): string`, `listFiles(): string[]`, `getMetadata(): Record<string, unknown>`.

### Task 4: Implement OutputBuilder

**Files:**
- Create: `packages/worker-sdk/src/output-builder.ts`
- Create: `packages/worker-sdk/src/output-builder.test.ts`

Builder pattern: `addFile(name, content)`, `setMetadata(key, value)`, `setType(packageType)`, `build(): PackageOutput`. Validates output type is set before build.

### Task 5: Implement QuestionTimeoutError

**Files:**
- Create: `packages/worker-sdk/src/errors.ts`

Custom error for askQuestion timeout.

### Task 6: Implement WorkerContext Class

**Files:**
- Modify: `packages/worker-sdk/src/context.ts`
- Create: `packages/worker-sdk/src/context.test.ts`

Static factory or internal constructor. Properties: `ai`, `inputPackage`, `outputBuilder`, `logger` (Pino with jobId/workerId base context), `jobId`, `packageId`. Method: `askQuestion()` with exponential backoff polling and timeout.

### Task 7: Update barrel exports and fix base-worker tests

**Files:**
- Modify: `packages/worker-sdk/src/index.ts`
- Modify: `packages/worker-sdk/src/base-worker.test.ts`

### Task 8: Full validation

Run typecheck, lint, tests with coverage. Ensure 100% critical path, 80%+ overall.
