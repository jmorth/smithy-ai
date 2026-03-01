# Task 057: Create SmithyWorker Base Class

## Summary
Create the abstract `SmithyWorker` base class with lifecycle hook signatures: `onReceive`, `onProcess`, `onComplete`, `onError`. This is the foundation of the Worker SDK — every Worker extends this class and implements the hooks to define its behavior. The class enforces a consistent lifecycle contract between the runner (task 061) and user-authored Workers.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 006 (Worker SDK Package Scaffold — provides the package structure), 020 (Shared Types — provides Package, WorkerContext, PackageOutput types)
- **Blocks**: 058 (Worker Execution Context), 059 (Worker SDK API Client), 060 (Worker AI Provider Wrapper), 061 (Worker SDK Runner), 062 (Base Docker Image), 063 (Worker SDK Tests)

## Architecture Reference
The Worker SDK (`@smithy/worker-sdk`) is an npm package that runs inside ephemeral Docker containers. The `SmithyWorker` abstract class lives at the root of the SDK and defines the lifecycle contract. Workers are TypeScript classes that extend `SmithyWorker` and implement the abstract methods. The runner (task 061) dynamically imports the Worker class, instantiates it, and calls the lifecycle hooks in order. Types are imported from `@smithy/shared` to ensure consistency between the API and the SDK.

## Files and Folders
- `/packages/worker-sdk/src/base-worker.ts` — Abstract `SmithyWorker` class with lifecycle hook definitions

## Acceptance Criteria
- [ ] `SmithyWorker` is an abstract class exported from the package
- [ ] `abstract onReceive(pkg: Package): Promise<void>` — called when the Worker receives its input Package; used for validation or preprocessing
- [ ] `abstract onProcess(context: WorkerContext): Promise<PackageOutput>` — the main processing hook; receives full context (AI, files, logger) and returns output
- [ ] `onComplete(output: PackageOutput): Promise<void>` — called after successful processing; has a default implementation that logs completion (overridable)
- [ ] `onError(error: Error): Promise<void>` — called when processing fails; has a default implementation that logs the error (overridable)
- [ ] Uses types from `@smithy/shared`: `Package`, `WorkerContext`, `PackageOutput`
- [ ] The class compiles without errors via `pnpm --filter worker-sdk build`
- [ ] Exported as a named export from the package entry point (`index.ts`)

## Implementation Notes
- Keep the base class minimal — it should define the contract, not carry implementation weight. The `WorkerContext` (task 058) holds the runtime capabilities.
- The default `onComplete` implementation should call `this.logger?.info('Worker completed successfully')` if a logger is available, otherwise be a no-op.
- The default `onError` implementation should call `this.logger?.error('Worker failed', { error: error.message })` and re-throw the error so the runner captures it.
- Consider adding a `name` property that defaults to the class name — useful for logging and debugging.
- The `WorkerContext` type is defined in task 058, but the type declaration should live in `@smithy/shared` so it can be referenced here without circular dependencies.
- Do NOT add constructor logic that depends on the runtime environment (env vars, file system) — that belongs in the runner. The base class should be unit-testable in isolation.
