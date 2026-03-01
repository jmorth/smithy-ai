# Task 006: Scaffold Worker SDK Package

## Summary
Create the `@smithy/worker-sdk` package skeleton with an empty source structure for the base worker class, execution context, AI abstraction, API client, and runner. This SDK is consumed by individual worker implementations and provides the runtime framework for worker lifecycle management, AI provider integration, and communication with the Smithy API.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 001 (Initialize pnpm Workspace), 003 (TypeScript Base Config)
- **Blocks**: 057-063 (Worker SDK implementation tasks in Phase 3)

## Architecture Reference
`@smithy/worker-sdk` depends on `@smithy/shared` for type definitions and sits one level above it in the dependency graph. Individual workers in the `workers/*` directory depend on this SDK. The SDK provides:
- `BaseWorker` — abstract class that workers extend
- `WorkerContext` — execution context with package data, AI access, file storage
- `AI` — unified abstraction over AI providers (OpenAI, Anthropic)
- `APIClient` — typed HTTP client for the Smithy API
- `Runner` — process that connects to RabbitMQ, picks up jobs, and invokes workers

## Files and Folders
- `/packages/worker-sdk/package.json` — Package manifest with `name: "@smithy/worker-sdk"`, dependency on `@smithy/shared`
- `/packages/worker-sdk/tsconfig.json` — TypeScript config extending `../../tsconfig.base.json`
- `/packages/worker-sdk/src/index.ts` — Barrel export (initially empty or with placeholder re-exports)
- `/packages/worker-sdk/src/base-worker.ts` — Placeholder for BaseWorker abstract class
- `/packages/worker-sdk/src/context.ts` — Placeholder for WorkerContext class
- `/packages/worker-sdk/src/ai.ts` — Placeholder for AI abstraction
- `/packages/worker-sdk/src/api-client.ts` — Placeholder for API client
- `/packages/worker-sdk/src/runner.ts` — Placeholder for runner process

## Acceptance Criteria
- [ ] Package has `"name": "@smithy/worker-sdk"` in package.json
- [ ] `tsconfig.json` extends `../../tsconfig.base.json`
- [ ] Package compiles with `tsc --noEmit` without errors
- [ ] Depends on `@smithy/shared` via workspace protocol (`"@smithy/shared": "workspace:*"`)
- [ ] All source files exist with placeholder exports (e.g., `export {};` or stub class/interface)
- [ ] `src/index.ts` barrel exports from all source modules
- [ ] `package.json` specifies `"main"`, `"types"`, and `"exports"` fields

## Implementation Notes
- Like `@smithy/shared`, point entry fields at `src/` for workspace development. A build step can be added later.
- Set `"type": "module"` in package.json.
- Each placeholder file should export at minimum an empty object or a TODO comment so that the barrel export doesn't fail.
- Runtime dependencies (amqplib, AI SDKs, etc.) will be added in Phase 3 tasks — do NOT add them now. Only add `@smithy/shared` as a workspace dependency and `typescript` as a devDependency.
- The file structure mirrors the eventual SDK architecture but no implementation is expected at this stage.
