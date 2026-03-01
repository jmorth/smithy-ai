# Task 033: Create Package Status Machine

## Summary
Implement a Package status transition validator that enforces a defined state machine — only specific transitions between `PackageStatus` values are allowed (e.g., `PENDING` to `IN_TRANSIT` is valid, `COMPLETED` to `PENDING` is not). This prevents invalid status changes that could corrupt workflow state and makes the system's lifecycle guarantees explicit.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 032 (Package Service), 019 (Shared Enums — PackageStatus)
- **Blocks**: 035 (Package REST Controller)

## Architecture Reference
The Package status machine defines the lifecycle of a Package as it flows through the Smithy system. Packages start as `PENDING`, move through `IN_TRANSIT` and `PROCESSING`, and end at `COMPLETED`, `FAILED`, or `EXPIRED`. The state machine is a pure function (no side effects, no dependencies) that can be tested in isolation. It is integrated into `PackagesService.update()` to reject invalid transitions before they reach the database.

## Files and Folders
- `/apps/api/src/modules/packages/package-status.machine.ts` — Status transition map and validation function
- `/apps/api/src/modules/packages/packages.service.ts` — Updated to use status machine in `update()` method

## Acceptance Criteria
- [ ] Exports `isValidTransition(from: PackageStatus, to: PackageStatus): boolean`
- [ ] Exports `getValidTransitions(from: PackageStatus): PackageStatus[]` for introspection
- [ ] Valid transition map is defined:
  - `PENDING` → `IN_TRANSIT`, `PROCESSING`, `FAILED`
  - `IN_TRANSIT` → `PROCESSING`, `FAILED`
  - `PROCESSING` → `COMPLETED`, `FAILED`
  - `COMPLETED` → `EXPIRED`
  - `FAILED` → (terminal — no transitions out, except optionally back to `PENDING` for retry)
  - `EXPIRED` → (terminal — no transitions out)
- [ ] `PackagesService.update()` calls `isValidTransition()` when the `status` field is being changed
- [ ] Invalid transitions result in a `BadRequestException` with message: `"Invalid status transition from {current} to {target}. Valid transitions: {list}"`
- [ ] Same-status transitions (e.g., `PROCESSING` → `PROCESSING`) are allowed (idempotent, no-op)
- [ ] Transition map is exported as a constant for documentation and testing purposes

## Implementation Notes
- Use a `Record<PackageStatus, PackageStatus[]>` for the transition map — it is simple, readable, and exhaustive when typed correctly.
- Example structure:
  ```typescript
  const TRANSITION_MAP: Record<PackageStatus, PackageStatus[]> = {
    [PackageStatus.PENDING]: [PackageStatus.IN_TRANSIT, PackageStatus.PROCESSING, PackageStatus.FAILED],
    [PackageStatus.IN_TRANSIT]: [PackageStatus.PROCESSING, PackageStatus.FAILED],
    // ...
  };
  ```
- Consider whether `FAILED` should allow retry (transition back to `PENDING`). For MVP, keeping `FAILED` as terminal is simpler. If retry is needed later, it can be added to the map without breaking existing code.
- The status machine is intentionally a pure module (no NestJS decorators, no DI) — it can be imported and used anywhere, including in tests and the worker runtime.
- Consider exporting a `PackageStatusMachine` object with methods rather than standalone functions, for better namespacing.
