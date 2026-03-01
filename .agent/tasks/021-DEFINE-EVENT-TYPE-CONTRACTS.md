# Task 021: Define Event Type Contracts

## Summary
Define TypeScript types for all RabbitMQ event messages including the base event envelope structure, specific event payloads (PackageCreated, WorkerStateChanged, JobStarted, JobCompleted, JobStuck, JobError, AssemblyLineCompleted), and routing key constants. These contracts ensure type-safe event production and consumption across the API, workers, and real-time subsystems.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 019 (Shared Enums and Constants), 020 (Shared Type Interfaces)
- **Blocks**: 067-070 (Event Bus implementation in Phase 4), 071-075 (Real-time gateway in Phase 4)

## Architecture Reference
Smithy uses RabbitMQ as its event bus. Events are published when domain state changes (package created, job started, etc.) and consumed by:
- The **real-time gateway** (SSE/WebSocket) to push updates to the frontend
- The **notification service** to send emails/webhooks
- The **workflow engine** to advance packages through assembly line steps
- **Workers** to receive job assignments

Every event follows a standard envelope format with a type discriminator, correlation ID for tracing, timestamp, and a typed payload. Routing keys follow a dot-separated convention for RabbitMQ topic exchange routing.

## Files and Folders
- `/packages/shared/src/events/index.ts` — Barrel export for all event types and routing keys
- `/packages/shared/src/events/event-types.ts` — Base event envelope and all specific event payload interfaces
- `/packages/shared/src/events/routing-keys.ts` — Routing key constants for RabbitMQ topic exchange

## Acceptance Criteria
- [ ] Base event envelope type defined: `{ eventType: string, timestamp: string, correlationId: string, payload: T }`
- [ ] `PackageCreatedEvent` payload: packageId, type, metadata, createdBy?
- [ ] `WorkerStateChangedEvent` payload: jobExecutionId, workerId, workerVersionId, previousState (WorkerState), newState (WorkerState), packageId
- [ ] `JobStartedEvent` payload: jobExecutionId, packageId, workerVersionId, containerId?
- [ ] `JobCompletedEvent` payload: jobExecutionId, packageId, workerVersionId, outputPackageId?, duration (ms)
- [ ] `JobStuckEvent` payload: jobExecutionId, packageId, workerVersionId, reason, stuckSince (timestamp)
- [ ] `JobErrorEvent` payload: jobExecutionId, packageId, workerVersionId, error (message + stack?), retryCount, willRetry (boolean)
- [ ] `AssemblyLineCompletedEvent` payload: assemblyLineId, packageId, totalSteps, totalDuration (ms)
- [ ] Routing keys defined as constants: `package.created`, `job.state.changed`, `job.started`, `job.completed`, `job.stuck`, `job.error`, `assembly-line.completed`
- [ ] All types and constants exported from `@smithy/shared`
- [ ] Package compiles without error

## Implementation Notes
- The base event envelope should be a generic type:
  ```ts
  export interface SmithyEvent<T = unknown> {
    eventType: string;
    timestamp: string;  // ISO 8601
    correlationId: string;  // UUID for distributed tracing
    payload: T;
  }
  ```
- Define each specific event as a type alias combining the envelope with a specific payload:
  ```ts
  export type PackageCreatedEvent = SmithyEvent<{
    packageId: string;
    type: string;
    metadata: Record<string, unknown>;
    createdBy?: string;
  }>;
  ```
- Routing keys should be typed string constants, not an enum, for easier composition:
  ```ts
  export const RoutingKeys = {
    PACKAGE_CREATED: "package.created",
    JOB_STATE_CHANGED: "job.state.changed",
    JOB_STARTED: "job.started",
    JOB_COMPLETED: "job.completed",
    JOB_STUCK: "job.stuck",
    JOB_ERROR: "job.error",
    ASSEMBLY_LINE_COMPLETED: "assembly-line.completed",
  } as const;
  export type RoutingKey = (typeof RoutingKeys)[keyof typeof RoutingKeys];
  ```
- The `correlationId` enables tracing a package's journey through the entire system. It should be generated when a package is created and propagated through all related events.
- Consider adding a `EventTypeMap` that maps routing keys to their event types for type-safe event handlers:
  ```ts
  export interface EventTypeMap {
    [RoutingKeys.PACKAGE_CREATED]: PackageCreatedEvent;
    [RoutingKeys.JOB_STARTED]: JobStartedEvent;
    // ...
  }
  ```
- Update `events/index.ts` to re-export everything, and update the top-level `src/index.ts` to re-export from `./events`.
