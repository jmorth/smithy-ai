import { pgEnum, pgTable, uuid, varchar, integer, bigint, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { assemblyLines } from './workflows';

/**
 * PostgreSQL enum for the package lifecycle status.
 * updated_at does not auto-update via Drizzle; application code or a DB trigger must handle it.
 */
export const packageStatusEnum = pgEnum('package_status', [
  'PENDING',
  'IN_TRANSIT',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
]);

export const packages = pgTable('packages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  type: varchar('type').notNull(),
  status: packageStatusEnum('status').notNull().default('PENDING'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  assemblyLineId: uuid('assembly_line_id').references(() => assemblyLines.id, { onDelete: 'set null' }),
  currentStep: integer('current_step'),
  createdBy: varchar('created_by'),
  /** Soft delete — records with non-null deletedAt are considered deleted. */
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const packageFiles = pgTable('package_files', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  packageId: uuid('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
  /** MinIO object key for the stored file. */
  fileKey: varchar('file_key').notNull(),
  /** Original filename provided at upload time. */
  filename: varchar('filename').notNull(),
  mimeType: varchar('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});
