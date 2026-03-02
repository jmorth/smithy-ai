import { pgEnum, pgTable, uuid, varchar, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { packages } from './packages';
import { workerVersions } from './workers';

export const jobStatusEnum = pgEnum('job_status', [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'STUCK',
  'ERROR',
  'CANCELLED',
]);

export const jobExecutions = pgTable('job_executions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  packageId: uuid('package_id').notNull().references(() => packages.id),
  workerVersionId: uuid('worker_version_id').notNull().references(() => workerVersions.id),
  status: jobStatusEnum('status').notNull().default('QUEUED'),
  containerId: varchar('container_id'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
  logs: jsonb('logs').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => ({
  packageIdIdx: index('job_executions_package_id_idx').on(table.packageId),
  statusIdx: index('job_executions_status_idx').on(table.status),
  workerVersionIdIdx: index('job_executions_worker_version_id_idx').on(table.workerVersionId),
}));
