import { pgEnum, pgTable, uuid, varchar, text, integer, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const workerVersionStatusEnum = pgEnum('worker_version_status', [
  'ACTIVE',
  'DEPRECATED',
]);

export const workers = pgTable('workers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(),
  slug: varchar('slug').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const workerVersions = pgTable('worker_versions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workerId: uuid('worker_id').notNull().references(() => workers.id),
  version: integer('version').notNull(),
  yamlConfig: jsonb('yaml_config').notNull(),
  dockerfileHash: varchar('dockerfile_hash'),
  status: workerVersionStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => ({
  workerVersionUnique: unique().on(table.workerId, table.version),
}));
