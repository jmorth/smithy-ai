import { describe, it, expect } from 'vitest';
import { notificationTypeEnum, notificationStatusEnum, notifications, webhookEndpoints } from './notifications';

describe('notificationTypeEnum', () => {
  it('is defined', () => {
    expect(notificationTypeEnum).toBeDefined();
  });

  it('has EMAIL, IN_APP, and WEBHOOK values', () => {
    const values = notificationTypeEnum.enumValues;
    expect(values).toContain('EMAIL');
    expect(values).toContain('IN_APP');
    expect(values).toContain('WEBHOOK');
    expect(values).toHaveLength(3);
  });
});

describe('notificationStatusEnum', () => {
  it('is defined', () => {
    expect(notificationStatusEnum).toBeDefined();
  });

  it('has PENDING, SENT, READ, and FAILED values', () => {
    const values = notificationStatusEnum.enumValues;
    expect(values).toContain('PENDING');
    expect(values).toContain('SENT');
    expect(values).toContain('READ');
    expect(values).toContain('FAILED');
    expect(values).toHaveLength(4);
  });
});

describe('notifications table', () => {
  it('is defined', () => {
    expect(notifications).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(notifications[Symbol.for('drizzle:Name')]).toBe('notifications');
  });

  it('has all required columns', () => {
    expect(notifications.id).toBeDefined();
    expect(notifications.type).toBeDefined();
    expect(notifications.recipient).toBeDefined();
    expect(notifications.payload).toBeDefined();
    expect(notifications.status).toBeDefined();
    expect(notifications.sentAt).toBeDefined();
    expect(notifications.readAt).toBeDefined();
    expect(notifications.createdAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(notifications.id.columnType).toBe('PgUUID');
  });

  it('type column references notificationType enum and not null', () => {
    expect(notifications.type.columnType).toBe('PgEnumColumn');
    expect(notifications.type.notNull).toBe(true);
  });

  it('recipient column is varchar and not null', () => {
    expect(notifications.recipient.columnType).toBe('PgVarchar');
    expect(notifications.recipient.notNull).toBe(true);
  });

  it('payload column is jsonb and not null', () => {
    expect(notifications.payload.columnType).toBe('PgJsonb');
    expect(notifications.payload.notNull).toBe(true);
  });

  it('status column references notificationStatus enum and not null', () => {
    expect(notifications.status.columnType).toBe('PgEnumColumn');
    expect(notifications.status.notNull).toBe(true);
  });

  it('sentAt column is timestamp and nullable', () => {
    expect(notifications.sentAt.columnType).toBe('PgTimestamp');
    expect(notifications.sentAt.notNull).toBe(false);
  });

  it('readAt column is timestamp and nullable', () => {
    expect(notifications.readAt.columnType).toBe('PgTimestamp');
    expect(notifications.readAt.notNull).toBe(false);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(notifications.createdAt.columnType).toBe('PgTimestamp');
    expect(notifications.createdAt.notNull).toBe(true);
  });
});

describe('webhookEndpoints table', () => {
  it('is defined', () => {
    expect(webhookEndpoints).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(webhookEndpoints[Symbol.for('drizzle:Name')]).toBe('webhook_endpoints');
  });

  it('has all required columns', () => {
    expect(webhookEndpoints.id).toBeDefined();
    expect(webhookEndpoints.url).toBeDefined();
    expect(webhookEndpoints.secret).toBeDefined();
    expect(webhookEndpoints.events).toBeDefined();
    expect(webhookEndpoints.active).toBeDefined();
    expect(webhookEndpoints.createdAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(webhookEndpoints.id.columnType).toBe('PgUUID');
  });

  it('url column is varchar and not null', () => {
    expect(webhookEndpoints.url.columnType).toBe('PgVarchar');
    expect(webhookEndpoints.url.notNull).toBe(true);
  });

  it('secret column is varchar and not null', () => {
    expect(webhookEndpoints.secret.columnType).toBe('PgVarchar');
    expect(webhookEndpoints.secret.notNull).toBe(true);
  });

  it('events column is a text array and not null', () => {
    expect(webhookEndpoints.events.columnType).toBe('PgArray');
    expect(webhookEndpoints.events.notNull).toBe(true);
  });

  it('active column is boolean and not null', () => {
    expect(webhookEndpoints.active.columnType).toBe('PgBoolean');
    expect(webhookEndpoints.active.notNull).toBe(true);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(webhookEndpoints.createdAt.columnType).toBe('PgTimestamp');
    expect(webhookEndpoints.createdAt.notNull).toBe(true);
  });
});

describe('schema/index re-exports notifications', () => {
  it('re-exports notificationTypeEnum, notificationStatusEnum, notifications, and webhookEndpoints', async () => {
    const idx = await import('./index');
    expect(idx.notificationTypeEnum).toBeDefined();
    expect(idx.notificationStatusEnum).toBeDefined();
    expect(idx.notifications).toBeDefined();
    expect(idx.webhookEndpoints).toBeDefined();
  });
});
