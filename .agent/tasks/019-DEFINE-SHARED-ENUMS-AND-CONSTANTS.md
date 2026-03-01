# Task 019: Define Shared Enums and Constants

## Summary
Define the core domain enums (`WorkerState`, `PackageStatus`, `JobStatus`) and default package type constants in the `@smithy/shared` package. These enums are the single source of truth for state machines and status tracking across the entire Smithy system — used by the API, workers, CLI, and frontend alike.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 005 (Shared Types Package scaffold)
- **Blocks**: 020 (Shared Type Interfaces), 021 (Event Type Contracts), 031+ (backend modules use these enums)

## Architecture Reference
Enums and constants in `@smithy/shared` are consumed by every layer of the Smithy stack. They must be runtime values (not just TypeScript types) because they are used in:
- Database queries (filtering by status)
- API responses (serialized to JSON)
- Event payloads (RabbitMQ messages)
- Frontend UI (rendering status badges)
- Worker SDK (state transitions)

Keeping these in a single shared package prevents enum drift between frontend and backend.

## Files and Folders
- `/packages/shared/src/constants/index.ts` — Barrel export for all constants
- `/packages/shared/src/constants/enums.ts` — `WorkerState`, `PackageStatus`, `JobStatus` enums
- `/packages/shared/src/constants/package-types.ts` — Default package type constants

## Acceptance Criteria
- [ ] `WorkerState` enum has values: `WAITING`, `WORKING`, `DONE`, `STUCK`, `ERROR`
- [ ] `PackageStatus` enum has values: `PENDING`, `IN_TRANSIT`, `PROCESSING`, `COMPLETED`, `FAILED`, `EXPIRED`
- [ ] `JobStatus` enum has values: `QUEUED`, `RUNNING`, `COMPLETED`, `STUCK`, `ERROR`, `CANCELLED`
- [ ] Default package types defined as constants: `USER_INPUT`, `SPECIFICATION`, `CODE`, `IMAGE`, `PULL_REQUEST`
- [ ] All enums and constants are exported from `@smithy/shared` (accessible via `import { PackageStatus } from "@smithy/shared"`)
- [ ] `@smithy/shared` package compiles without error
- [ ] Enums are usable as both types and runtime values

## Implementation Notes
- Use TypeScript `const enum` only if tree-shaking is critical; otherwise prefer regular `enum` or `as const` objects for runtime availability. Recommendation: use `as const` objects with derived types for maximum flexibility:
  ```ts
  export const PackageStatus = {
    PENDING: "PENDING",
    IN_TRANSIT: "IN_TRANSIT",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    EXPIRED: "EXPIRED",
  } as const;
  export type PackageStatus = (typeof PackageStatus)[keyof typeof PackageStatus];
  ```
  This pattern gives you both a runtime object (for iteration, comparison) and a type (for type annotations).
- For package types, use a similar `as const` pattern:
  ```ts
  export const PackageType = {
    USER_INPUT: "USER_INPUT",
    SPECIFICATION: "SPECIFICATION",
    CODE: "CODE",
    IMAGE: "IMAGE",
    PULL_REQUEST: "PULL_REQUEST",
  } as const;
  ```
- Ensure the enum values match EXACTLY with the PostgreSQL enum values defined in the Drizzle schema (tasks 014-017). If there is a mismatch, queries will fail at runtime.
- Update `constants/index.ts` to re-export everything from `enums.ts` and `package-types.ts`.
- Update the top-level `src/index.ts` to re-export from `./constants`.
