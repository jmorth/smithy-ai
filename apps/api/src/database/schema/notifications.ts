import { pgEnum, pgTable, uuid, varchar, jsonb, timestamp, boolean, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const notificationTypeEnum = pgEnum('notification_type', [
  'EMAIL',
  'IN_APP',
  'WEBHOOK',
]);

export const notificationStatusEnum = pgEnum('notification_status', [
  'PENDING',
  'SENT',
  'READ',
  'FAILED',
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  type: notificationTypeEnum('type').notNull(),
  recipient: varchar('recipient').notNull(),
  payload: jsonb('payload').notNull(),
  status: notificationStatusEnum('status').notNull().default('PENDING'),
  sentAt: timestamp('sent_at'),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  url: varchar('url').notNull(),
  secret: varchar('secret').notNull(),
  events: text('events').array().notNull(),
  ownerId: varchar('owner_id').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
  lastDeliveryAt: timestamp('last_delivery_at'),
  lastDeliveryStatus: varchar('last_delivery_status'),
});
