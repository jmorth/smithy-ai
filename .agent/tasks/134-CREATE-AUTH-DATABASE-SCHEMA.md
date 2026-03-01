# Task 134: Create Auth Database Schema

## Summary
Create the `users` database table schema using Drizzle ORM as preparation for future multi-tenant authentication. The table is created and migrated but not enforced as a foreign key by any other table in the MVP — it exists purely as forward-looking scaffolding so that the auth upgrade path is clean.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: 013 (Drizzle ORM Configuration)
- **Blocks**: 135 (Passthrough Auth Guard)

## Architecture Reference
Smithy's MVP is single-user, but the data model should be ready for multi-tenant auth. The `users` table defines the identity entity that will eventually be referenced by `packages.created_by`, `assembly_lines.owner_id`, and other ownership columns. For now, no FK constraints point to this table — the passthrough auth guard (task 135) returns a hard-coded stub user whose ID does not need to exist in the database.

The schema lives alongside the existing Drizzle schema files in `apps/api/src/database/schema/` and is registered in the barrel export so Drizzle Kit picks it up during migration generation.

## Files and Folders
- `/apps/api/src/database/schema/auth.ts` — Drizzle schema definition for the `users` table
- `/apps/api/src/database/schema/index.ts` — Update barrel export to include auth schema

## Acceptance Criteria
- [ ] `users` table has: `id` (uuid PK, default `gen_random_uuid()`), `email` (varchar(255), unique, not null), `name` (varchar(255), not null), `created_at` (timestamp, default now), `updated_at` (timestamp, default now)
- [ ] Schema file is exported from `apps/api/src/database/schema/index.ts`
- [ ] Drizzle Kit migration is generated (`pnpm db:generate`) without errors
- [ ] Migration applies cleanly against a running Docker Compose PostgreSQL instance (`pnpm db:migrate`)
- [ ] The `users` table exists in the database after migration
- [ ] No other table has a foreign key constraint referencing `users` (MVP = single user)
- [ ] Schema file compiles without TypeScript errors
- [ ] Code comment documents the intent: `// MVP: table created for forward-compat; no FKs reference this yet`

## Implementation Notes
- Use Drizzle's `pgTable`, `uuid`, `varchar`, `timestamp` column types.
- Define the table with:
  ```ts
  import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
  import { sql } from "drizzle-orm";

  // MVP: table created for forward-compat; no FKs reference this yet
  export const users = pgTable("users", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });
  ```
- Export a `User` type using Drizzle's `InferSelectModel` for use in the auth guard and decorator:
  ```ts
  import { InferSelectModel } from "drizzle-orm";
  export type User = InferSelectModel<typeof users>;
  ```
- Do NOT add `password_hash`, `role`, or other auth-specific columns yet — that is future work for the real auth implementation.
- The `updated_at` column does not auto-update via trigger; document that application code should set it on writes (consistent with the approach in task 014).
