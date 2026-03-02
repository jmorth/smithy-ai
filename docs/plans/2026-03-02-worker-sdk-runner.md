# Worker SDK Runner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `runner.ts` — the Docker ENTRYPOINT that loads YAML config, imports the Worker class, constructs runtime context, and orchestrates lifecycle hooks.

**Architecture:** The runner is a top-level script (not a class) executed via `tsx`. It reads YAML from `/config/worker.yaml`, dynamically imports the Worker from `/worker/worker.ts`, validates it extends `SmithyWorker`, creates all dependencies (API client, AI provider, input package, output builder, context), then runs the lifecycle: `onReceive` → `onProcess` → `onComplete` (or `onError` on failure). Process-level handlers catch uncaught exceptions/rejections.

**Tech Stack:** TypeScript, yaml (npm), pino, Vitest

---

### Task 1: Install yaml dependency

**Files:**
- Modify: `packages/worker-sdk/package.json`

**Step 1:** Run `pnpm add yaml --filter @smithy/worker-sdk`

---

### Task 2: Implement runner.ts

**Files:**
- Modify: `packages/worker-sdk/src/runner.ts`

Key design decisions:
- Export a `run()` function for testability (not top-level side effects)
- Export a `WorkerYamlConfig` interface for the YAML shape
- Process exit codes: 0 = success, 1 = runtime error, 2 = invalid worker module, 124 = timeout
- Job status transitions use actual `JobStatus` enum values: RUNNING → COMPLETED / ERROR
- Environment variables: `SMITHY_API_URL`, `SMITHY_API_KEY`, `SMITHY_JOB_ID`, `SMITHY_PACKAGE_ID`, `SMITHY_WORKER_ID`
- The file ends with a top-level `run()` call guarded by `import.meta.url` check (only runs when executed directly, not when imported for testing)

---

### Task 3: Write comprehensive tests

**Files:**
- Create: `packages/worker-sdk/src/runner.test.ts`

Test categories:
1. YAML loading — valid config, missing file, invalid YAML
2. Dynamic import — valid worker, missing export, non-SmithyWorker export
3. Lifecycle orchestration — happy path (onReceive → onProcess → onComplete), error path (onError)
4. Status updates — verify API client called with correct statuses
5. Output submission — verify createOutputPackage called on success
6. Timeout — verify process exits with code 124
7. Process handlers — uncaughtException and unhandledRejection
8. Environment variable validation — missing required vars

---

### Task 4: Verify coverage targets

Run: `pnpm --filter @smithy/worker-sdk test -- --coverage`
Target: 100% critical path, 80%+ overall
