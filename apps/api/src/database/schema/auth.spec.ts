import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { users, type User } from './auth';

describe('users table', () => {
  it('is defined', () => {
    expect(users).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(users[Symbol.for('drizzle:Name')]).toBe('users');
  });

  it('has all required columns', () => {
    expect(users.id).toBeDefined();
    expect(users.email).toBeDefined();
    expect(users.name).toBeDefined();
    expect(users.createdAt).toBeDefined();
    expect(users.updatedAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(users.id.columnType).toBe('PgUUID');
  });

  it('email column is varchar(255), not null, unique', () => {
    expect(users.email.columnType).toBe('PgVarchar');
    expect(users.email.notNull).toBe(true);
    expect(users.email.isUnique).toBe(true);
  });

  it('name column is varchar(255) and not null', () => {
    expect(users.name.columnType).toBe('PgVarchar');
    expect(users.name.notNull).toBe(true);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(users.createdAt.columnType).toBe('PgTimestamp');
    expect(users.createdAt.notNull).toBe(true);
  });

  it('updatedAt column is timestamp and not null', () => {
    expect(users.updatedAt.columnType).toBe('PgTimestamp');
    expect(users.updatedAt.notNull).toBe(true);
  });

  it('has no foreign key constraints (MVP: no FKs reference this table)', () => {
    const config = getTableConfig(users);
    expect(config.foreignKeys).toHaveLength(0);
  });
});

describe('User type', () => {
  it('is assignable from a valid user object', () => {
    const user: User = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(user).toBeDefined();
    expect(user.id).toBe('00000000-0000-0000-0000-000000000000');
    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('Test User');
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });
});

describe('schema/index re-exports auth', () => {
  it('re-exports users table from barrel', async () => {
    const idx = await import('./index');
    expect(idx.users).toBeDefined();
  });
});
