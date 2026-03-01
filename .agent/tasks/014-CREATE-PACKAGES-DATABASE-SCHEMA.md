# Task 014: Create Packages Database Schema

## Summary
Create the Drizzle schema for the `packages` and `package_files` tables with UUID primary keys, JSONB metadata, status enum, soft delete support, and timestamps. Packages are the central data unit in Smithy — they represent work items that flow through assembly lines and are processed by workers.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 013 (Drizzle ORM Configuration)
- **Blocks**: 018 (Relations and Migration), 031-036 (Package module in Phase 2)

## Architecture Reference
In the Smithy domain model, a **Package** is a container for data flowing through the system. Packages have a type (e.g., USER_INPUT, SPECIFICATION, CODE), a status tracking their lifecycle, JSONB metadata for flexible schema-per-type data, and associated files stored in MinIO. The `package_files` table tracks file references linked to each package.

The packages table has a nullable `assembly_line_id` FK (defined here as a column, with the FK constraint added in task 018 when the workflows schema exists) and `current_step` to track position in a workflow.

## Files and Folders
- `/apps/api/src/database/schema/packages.ts` — Drizzle schema definitions for `packages` and `package_files` tables, plus the `packageStatus` enum

## Acceptance Criteria
- [ ] `packages` table has: `id` (uuid PK, default `gen_random_uuid()`), `type` (varchar, not null), `status` (enum: PENDING/IN_TRANSIT/PROCESSING/COMPLETED/FAILED/EXPIRED), `metadata` (jsonb, default `{}`), `assembly_line_id` (uuid, nullable), `current_step` (integer, nullable), `created_by` (varchar, nullable), `deleted_at` (timestamp, nullable — for soft delete), `created_at` (timestamp, default now), `updated_at` (timestamp, default now)
- [ ] `package_files` table has: `id` (uuid PK, default `gen_random_uuid()`), `package_id` (uuid, FK to packages, not null), `file_key` (varchar, not null — MinIO object key), `filename` (varchar, not null — original filename), `mime_type` (varchar, not null), `size_bytes` (bigint, not null), `created_at` (timestamp, default now)
- [ ] `packageStatus` is defined as a PostgreSQL enum type via Drizzle's `pgEnum`
- [ ] All tables and columns are exported for use in other schema files and queries
- [ ] Schema file compiles without error

## Implementation Notes
- Use Drizzle's `pgTable`, `pgEnum`, `uuid`, `varchar`, `text`, `integer`, `bigint`, `jsonb`, `timestamp`, `boolean` column types.
- Define the status enum with `pgEnum`:
  ```ts
  export const packageStatusEnum = pgEnum("package_status", [
    "PENDING", "IN_TRANSIT", "PROCESSING", "COMPLETED", "FAILED", "EXPIRED"
  ]);
  ```
- Use `defaultRandom()` for UUID primary keys or `.default(sql`gen_random_uuid()`)`.
- The `metadata` column uses `jsonb` type with a default of `{}`.
- The `assembly_line_id` column is defined as a uuid column here but the foreign key constraint to the `assembly_lines` table will be added in task 018 (since that table doesn't exist yet).
- Soft delete is implemented via the nullable `deleted_at` timestamp — records with a non-null `deleted_at` are considered deleted.
- The `updated_at` column should ideally auto-update, but Drizzle doesn't support triggers directly. Document that application code or a DB trigger should handle this.
- Export the table definitions and enum so they can be imported in `schema/index.ts` and `relations.ts`.
