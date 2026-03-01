# Task 020: Define Shared Type Interfaces

## Summary
Define the core TypeScript interfaces for all domain entities: Package, PackageFile, Worker, WorkerVersion, WorkerConfig, AssemblyLine, AssemblyLineStep, WorkerPool, WorkerPoolMember, JobExecution, RetryStrategy, and Notification. These interfaces are the API contract between every component in the Smithy system.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 019 (Shared Enums and Constants — interfaces reference these enums)
- **Blocks**: 021 (Event Type Contracts), 031+ (all modules use shared types)

## Architecture Reference
These interfaces represent the domain model as seen by consumers outside the database layer. They differ from Drizzle schema types in that they are:
- Database-agnostic (no Drizzle-specific types)
- Isomorphic (no Node/browser-specific imports)
- Used in API request/response bodies, event payloads, worker context, and frontend state

The interfaces mirror the database schema but use TypeScript-idiomatic naming and may omit internal-only fields.

## Files and Folders
- `/packages/shared/src/types/package.ts` — `Package`, `PackageFile` interfaces
- `/packages/shared/src/types/worker.ts` — `Worker`, `WorkerVersion`, `WorkerConfig` interfaces
- `/packages/shared/src/types/workflow.ts` — `AssemblyLine`, `AssemblyLineStep`, `WorkerPool`, `WorkerPoolMember` interfaces
- `/packages/shared/src/types/job.ts` — `JobExecution`, `RetryStrategy` interfaces
- `/packages/shared/src/types/notification.ts` — `Notification`, `WebhookEndpoint` interfaces
- `/packages/shared/src/types/index.ts` — Barrel export for all type files

## Acceptance Criteria
- [ ] `Package` interface includes: id, type, status (PackageStatus), metadata (Record<string, unknown>), assemblyLineId?, currentStep?, createdBy?, deletedAt?, createdAt, updatedAt
- [ ] `PackageFile` interface includes: id, packageId, fileKey, filename, mimeType, sizeBytes, createdAt
- [ ] `Worker` interface includes: id, name, slug, description?, createdAt, updatedAt
- [ ] `WorkerVersion` interface includes: id, workerId, version, yamlConfig (WorkerConfig), dockerfileHash?, status, createdAt
- [ ] `WorkerConfig` interface includes: name, inputTypes (string[]), outputType (string), provider ({ name, model, apiKeyEnv }), tools? (string[]), timeout? (number)
- [ ] `AssemblyLine` interface includes: id, name, slug, description?, status, createdAt, updatedAt
- [ ] `AssemblyLineStep` interface includes: id, assemblyLineId, stepNumber, workerVersionId, configOverrides?
- [ ] `WorkerPool` interface includes: id, name, slug, description?, status, maxConcurrency, createdAt, updatedAt
- [ ] `WorkerPoolMember` interface includes: id, poolId, workerVersionId, priority
- [ ] `JobExecution` interface includes: id, packageId, workerVersionId, status (JobStatus), containerId?, startedAt?, completedAt?, errorMessage?, retryCount, logs (unknown[]), createdAt
- [ ] `RetryStrategy` interface includes: type ('immediate' | 'backoff' | 'skip'), maxRetries? (number)
- [ ] `Notification` interface includes: id, type, recipient, payload, status, sentAt?, createdAt
- [ ] All interfaces use enums from task 019 for status fields
- [ ] No Node-specific or browser-specific imports (isomorphic)
- [ ] `@smithy/shared` compiles and exports all types from barrel

## Implementation Notes
- Use `interface` (not `type`) for all entity types — this allows declaration merging if consumers need to extend them.
- Date fields should be typed as `string` (ISO 8601) rather than `Date` to ensure JSON serialization compatibility across API boundaries.
- The `WorkerConfig` interface is critical — it defines the parsed structure of a worker's YAML configuration:
  ```ts
  export interface WorkerConfig {
    name: string;
    inputTypes: string[];
    outputType: string;
    provider: {
      name: string;   // e.g., "openai", "anthropic"
      model: string;  // e.g., "gpt-4o", "claude-sonnet-4-20250514"
      apiKeyEnv: string; // env var name, e.g., "OPENAI_API_KEY"
    };
    tools?: string[];
    timeout?: number; // seconds
  }
  ```
- The `metadata` field in `Package` is intentionally `Record<string, unknown>` — different package types will have different metadata shapes. Type narrowing happens at the application layer.
- The `logs` field in `JobExecution` is typed as `unknown[]` since log entry structure may evolve. Consider defining a `LogEntry` interface if the structure is stable.
- Update `types/index.ts` to re-export everything, and update the top-level `src/index.ts` to re-export from `./types`.
