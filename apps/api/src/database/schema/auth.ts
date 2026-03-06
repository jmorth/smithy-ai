import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { sql, type InferSelectModel } from 'drizzle-orm';

// MVP: table created for forward-compat; no FKs reference this yet
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = InferSelectModel<typeof users>;
