# Task 018: Create Drizzle Relations and Initial Migration

## Summary
Define all Drizzle ORM relation mappings for type-safe joins across every schema table, update the barrel export to re-export all schemas and relations, and generate and apply the initial database migration. This task connects the individual schema files into a cohesive data model and produces the first runnable migration that creates all tables in PostgreSQL.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 014 (Packages Schema), 015 (Workers Schema), 016 (Workflows Schema), 017 (Jobs/Notifications Schema)
- **Blocks**: 024 (Database Module in NestJS), 031+ (all modules querying related data)

## Architecture Reference
Drizzle ORM uses explicit `relations()` definitions to enable the type-safe relational query API (`db.query.packages.findMany({ with: { files: true } })`). Without these definitions, only raw SQL joins work. Every foreign key in the schema should have a corresponding relation definition so the query builder understands the graph.

The complete relationship map:
- `packages` ←→ `packageFiles` (one-to-many)
- `packages` ←→ `jobExecutions` (one-to-many)
- `packages` ←→ `assemblyLines` (many-to-one, via `assembly_line_id`)
- `workers` ←→ `workerVersions` (one-to-many)
- `workerVersions` ←→ `assemblyLineSteps` (one-to-many)
- `workerVersions` ←→ `workerPoolMembers` (one-to-many)
- `workerVersions` ←→ `jobExecutions` (one-to-many)
- `assemblyLines` ←→ `assemblyLineSteps` (one-to-many)
- `assemblyLines` ←→ `packages` (one-to-many)
- `workerPools` ←→ `workerPoolMembers` (one-to-many)

## Files and Folders
- `/apps/api/src/database/schema/relations.ts` — All Drizzle relation definitions (or inline in each schema file if preferred)
- `/apps/api/src/database/schema/index.ts` — Updated barrel export re-exporting all schemas, enums, and relations
- `/apps/api/drizzle/` — Generated migration files (output of `drizzle-kit generate`)

## Acceptance Criteria
- [ ] All foreign key relationships have corresponding Drizzle `relations()` definitions
- [ ] Relations are defined in both directions where applicable (e.g., `packages` → `packageFiles` AND `packageFiles` → `packages`)
- [ ] `drizzle-kit generate` produces a migration file without error
- [ ] `drizzle-kit migrate` applies the migration to Docker Compose PostgreSQL without error
- [ ] All tables exist in the database with correct columns, types, constraints, and indexes
- [ ] Unique constraints are present: `workers.slug`, `assembly_lines.slug`, `worker_pools.slug`, `(worker_id, version)`, `(assembly_line_id, step_number)`
- [ ] Foreign key constraints are present and reference the correct tables
- [ ] `schema/index.ts` re-exports all table definitions, enums, and relations
- [ ] The Drizzle relational query API works (e.g., `db.query.packages.findMany({ with: { files: true } })`)

## Implementation Notes
- Drizzle relations are defined using the `relations()` function from `drizzle-orm`:
  ```ts
  import { relations } from "drizzle-orm";
  import { packages, packageFiles } from "./packages";

  export const packagesRelations = relations(packages, ({ many, one }) => ({
    files: many(packageFiles),
    assemblyLine: one(assemblyLines, {
      fields: [packages.assemblyLineId],
      references: [assemblyLines.id],
    }),
    jobExecutions: many(jobExecutions),
  }));
  ```
- You can define relations in a single `relations.ts` file or co-locate them in each schema file. A single file is easier to review but can get large. Either approach works — be consistent.
- After generating the migration, **review the SQL** before applying it. Check for:
  - Correct enum creation
  - Correct FK constraints and ON DELETE behavior
  - Expected indexes
  - No accidental data-destructive operations
- Run `drizzle-kit migrate` against the Docker Compose PostgreSQL to verify. The Docker stack must be running (`docker compose -f docker/docker-compose.yml up -d`).
- The `packages.assembly_line_id` FK to `assembly_lines` needs to be defined here since both tables now exist.
- Consider adding ON DELETE behavior: `CASCADE` for `package_files` (delete files when package is deleted), `SET NULL` for `packages.assembly_line_id`, `RESTRICT` for most other FKs.
