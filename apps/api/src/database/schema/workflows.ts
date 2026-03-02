import { pgEnum, pgTable, uuid, varchar, text, integer, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workerVersions } from './workers';

export const assemblyLineStatusEnum = pgEnum('assembly_line_status', [
  'ACTIVE',
  'PAUSED',
  'ARCHIVED',
]);

export const workerPoolStatusEnum = pgEnum('worker_pool_status', [
  'ACTIVE',
  'PAUSED',
  'ARCHIVED',
]);

export const assemblyLines = pgTable('assembly_lines', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(),
  slug: varchar('slug').notNull().unique(),
  description: text('description'),
  status: assemblyLineStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const assemblyLineSteps = pgTable('assembly_line_steps', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  assemblyLineId: uuid('assembly_line_id').notNull().references(() => assemblyLines.id),
  stepNumber: integer('step_number').notNull(),
  workerVersionId: uuid('worker_version_id').notNull().references(() => workerVersions.id),
  configOverrides: jsonb('config_overrides'),
}, (table) => ({
  assemblyLineStepUnique: unique().on(table.assemblyLineId, table.stepNumber),
}));

export const workerPools = pgTable('worker_pools', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(),
  slug: varchar('slug').notNull().unique(),
  description: text('description'),
  status: workerPoolStatusEnum('status').notNull().default('ACTIVE'),
  maxConcurrency: integer('max_concurrency').notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const workerPoolMembers = pgTable('worker_pool_members', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  poolId: uuid('pool_id').notNull().references(() => workerPools.id),
  workerVersionId: uuid('worker_version_id').notNull().references(() => workerVersions.id),
  priority: integer('priority').notNull().default(0),
});
