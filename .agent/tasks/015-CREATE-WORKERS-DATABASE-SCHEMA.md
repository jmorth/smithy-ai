# Task 015: Create Workers Database Schema

## Summary
Create the Drizzle schema for the `workers` and `worker_versions` tables with unique slug identifiers, immutable version records, and JSONB `yaml_config` storage. Workers are the processing units in Smithy — each worker defines an AI-powered task, and versions allow safe iteration without breaking running workflows.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 013 (Drizzle ORM Configuration)
- **Blocks**: 018 (Relations and Migration), 037-042 (Worker module in Phase 2)

## Architecture Reference
In the Smithy domain model, a **Worker** is a named, versioned processing unit. Each worker has a unique slug for URL-friendly identification. **Worker Versions** are immutable records — once created, a version's configuration cannot be changed. This enables safe rollbacks and ensures running workflows reference a stable configuration.

The `yaml_config` JSONB column stores the parsed worker configuration (input types, output type, AI provider, tools, timeout, etc.) that was originally defined in a YAML file by the developer.

## Files and Folders
- `/apps/api/src/database/schema/workers.ts` — Drizzle schema definitions for `workers` and `worker_versions` tables, plus the `workerVersionStatus` enum

## Acceptance Criteria
- [ ] `workers` table has: `id` (uuid PK, default `gen_random_uuid()`), `name` (varchar, not null), `slug` (varchar, unique, not null), `description` (text, nullable), `created_at` (timestamp, default now), `updated_at` (timestamp, default now)
- [ ] `worker_versions` table has: `id` (uuid PK, default `gen_random_uuid()`), `worker_id` (uuid, FK to workers, not null), `version` (integer, not null), `yaml_config` (jsonb, not null), `dockerfile_hash` (varchar, nullable), `status` (enum: ACTIVE/DEPRECATED), `created_at` (timestamp, default now)
- [ ] Unique constraint on `(worker_id, version)` — no duplicate version numbers per worker
- [ ] `workers.slug` has a unique index
- [ ] `workerVersionStatus` is defined as a PostgreSQL enum via `pgEnum`
- [ ] All tables, columns, and enums are exported
- [ ] Schema file compiles without error

## Implementation Notes
- Define the version status enum:
  ```ts
  export const workerVersionStatusEnum = pgEnum("worker_version_status", [
    "ACTIVE", "DEPRECATED"
  ]);
  ```
- For the unique constraint on `(worker_id, version)`, use Drizzle's composite unique:
  ```ts
  // In the table definition's extra config:
  (table) => ({
    workerVersionUnique: unique().on(table.workerId, table.version),
  })
  ```
- The `yaml_config` column stores the full parsed worker configuration as JSON. This is the source of truth for how a worker version behaves.
- The `dockerfile_hash` is nullable because not all workers require custom Dockerfiles — some may use a standard base image.
- The `slug` field should be auto-generated from the `name` during creation (handled by application code, not the schema).
- Worker versions are append-only by design — the application layer should prevent updates to existing version records.
