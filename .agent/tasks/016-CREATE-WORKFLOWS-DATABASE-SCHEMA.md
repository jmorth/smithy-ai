# Task 016: Create Workflows Database Schema

## Summary
Create the Drizzle schema for `assembly_lines`, `assembly_line_steps`, `worker_pools`, and `worker_pool_members` tables. Assembly lines define multi-step workflows where packages flow through a sequence of workers, while worker pools group interchangeable workers for load balancing and redundancy.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 013 (Drizzle ORM Configuration), 015 (Workers Schema — references `worker_versions`)
- **Blocks**: 018 (Relations and Migration), 043-051 (Workflow modules in Phase 2)

## Architecture Reference
In the Smithy domain model:
- **Assembly Line** — A named, ordered sequence of processing steps. A package enters at step 1, is processed by the worker at that step, and its output becomes the input for step 2, and so on.
- **Assembly Line Step** — A single step in an assembly line, referencing a specific worker version and optional configuration overrides.
- **Worker Pool** — A logical group of interchangeable worker versions. When a step references a pool instead of a specific worker, the system picks an available worker from the pool based on priority.
- **Worker Pool Member** — A worker version assigned to a pool with a priority level.

## Files and Folders
- `/apps/api/src/database/schema/workflows.ts` — Drizzle schema definitions for `assembly_lines`, `assembly_line_steps`, `worker_pools`, and `worker_pool_members` tables, plus the `assemblyLineStatus` enum

## Acceptance Criteria
- [ ] `assembly_lines` table has: `id` (uuid PK), `name` (varchar, not null), `slug` (varchar, unique, not null), `description` (text, nullable), `status` (enum: ACTIVE/PAUSED/ARCHIVED), `created_at`, `updated_at`
- [ ] `assembly_line_steps` table has: `id` (uuid PK), `assembly_line_id` (uuid, FK to assembly_lines, not null), `step_number` (integer, not null), `worker_version_id` (uuid, FK to worker_versions, not null), `config_overrides` (jsonb, nullable)
- [ ] `worker_pools` table has: `id` (uuid PK), `name` (varchar, not null), `slug` (varchar, unique, not null), `description` (text, nullable), `status` (enum — reuse `assemblyLineStatus` or define `workerPoolStatus`), `max_concurrency` (integer, not null), `created_at`, `updated_at`
- [ ] `worker_pool_members` table has: `id` (uuid PK), `pool_id` (uuid, FK to worker_pools, not null), `worker_version_id` (uuid, FK to worker_versions, not null), `priority` (integer, default 0)
- [ ] `assembly_lines.slug` and `worker_pools.slug` have unique indexes
- [ ] Unique constraint on `(assembly_line_id, step_number)` — no duplicate step numbers per assembly line
- [ ] All tables, columns, and enums are exported
- [ ] Schema file compiles without error

## Implementation Notes
- Define the assembly line status enum:
  ```ts
  export const assemblyLineStatusEnum = pgEnum("assembly_line_status", [
    "ACTIVE", "PAUSED", "ARCHIVED"
  ]);
  ```
- For worker pools, you can either reuse this enum or define a separate `workerPoolStatusEnum`. A separate enum is cleaner if pool statuses might diverge in the future.
- The `config_overrides` JSONB in `assembly_line_steps` allows per-step customization of a worker's behavior without creating a new worker version (e.g., overriding timeout, model, or temperature).
- The `priority` field in `worker_pool_members` determines which worker is preferred when multiple are available (higher priority = preferred).
- The `max_concurrency` in `worker_pools` limits how many jobs can run simultaneously across all members of the pool.
- Import `workerVersions` from `./workers.ts` for the FK references.
