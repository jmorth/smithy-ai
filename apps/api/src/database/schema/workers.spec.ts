import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { workerVersionStatusEnum, workers, workerVersions } from './workers';

describe('workerVersionStatusEnum', () => {
  it('is defined', () => {
    expect(workerVersionStatusEnum).toBeDefined();
  });

  it('has enumValues with ACTIVE and DEPRECATED', () => {
    const values = workerVersionStatusEnum.enumValues;
    expect(values).toContain('ACTIVE');
    expect(values).toContain('DEPRECATED');
    expect(values).toHaveLength(2);
  });
});

describe('workers table', () => {
  it('is defined', () => {
    expect(workers).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(workers[Symbol.for('drizzle:Name')]).toBe('workers');
  });

  it('has all required columns', () => {
    expect(workers.id).toBeDefined();
    expect(workers.name).toBeDefined();
    expect(workers.slug).toBeDefined();
    expect(workers.description).toBeDefined();
    expect(workers.createdAt).toBeDefined();
    expect(workers.updatedAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(workers.id.columnType).toBe('PgUUID');
  });

  it('name column is varchar and not null', () => {
    expect(workers.name.columnType).toBe('PgVarchar');
    expect(workers.name.notNull).toBe(true);
  });

  it('slug column is varchar and not null', () => {
    expect(workers.slug.columnType).toBe('PgVarchar');
    expect(workers.slug.notNull).toBe(true);
  });

  it('description column is text and nullable', () => {
    expect(workers.description.columnType).toBe('PgText');
    expect(workers.description.notNull).toBe(false);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(workers.createdAt.columnType).toBe('PgTimestamp');
    expect(workers.createdAt.notNull).toBe(true);
  });

  it('updatedAt column is timestamp and not null', () => {
    expect(workers.updatedAt.columnType).toBe('PgTimestamp');
    expect(workers.updatedAt.notNull).toBe(true);
  });
});

describe('workerVersions table', () => {
  it('is defined', () => {
    expect(workerVersions).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(workerVersions[Symbol.for('drizzle:Name')]).toBe('worker_versions');
  });

  it('has all required columns', () => {
    expect(workerVersions.id).toBeDefined();
    expect(workerVersions.workerId).toBeDefined();
    expect(workerVersions.version).toBeDefined();
    expect(workerVersions.yamlConfig).toBeDefined();
    expect(workerVersions.dockerfileHash).toBeDefined();
    expect(workerVersions.status).toBeDefined();
    expect(workerVersions.createdAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(workerVersions.id.columnType).toBe('PgUUID');
  });

  it('workerId column is uuid and not null', () => {
    expect(workerVersions.workerId.columnType).toBe('PgUUID');
    expect(workerVersions.workerId.notNull).toBe(true);
  });

  it('version column is integer and not null', () => {
    expect(workerVersions.version.columnType).toBe('PgInteger');
    expect(workerVersions.version.notNull).toBe(true);
  });

  it('yamlConfig column is jsonb and not null', () => {
    expect(workerVersions.yamlConfig.columnType).toBe('PgJsonb');
    expect(workerVersions.yamlConfig.notNull).toBe(true);
  });

  it('dockerfileHash column is varchar and nullable', () => {
    expect(workerVersions.dockerfileHash.columnType).toBe('PgVarchar');
    expect(workerVersions.dockerfileHash.notNull).toBe(false);
  });

  it('status column references the workerVersionStatus enum', () => {
    expect(workerVersions.status.columnType).toBe('PgEnumColumn');
    expect(workerVersions.status.notNull).toBe(true);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(workerVersions.createdAt.columnType).toBe('PgTimestamp');
    expect(workerVersions.createdAt.notNull).toBe(true);
  });

  it('has a composite unique constraint on (worker_id, version)', () => {
    const config = getTableConfig(workerVersions);
    expect(config.uniqueConstraints).toHaveLength(1);
    const cols = config.uniqueConstraints[0].columns.map((c) => c.name);
    expect(cols).toContain('worker_id');
    expect(cols).toContain('version');
  });
});

describe('schema/index re-exports workers', () => {
  it('re-exports workerVersionStatusEnum, workers, and workerVersions', async () => {
    const idx = await import('./index');
    expect(idx.workerVersionStatusEnum).toBeDefined();
    expect(idx.workers).toBeDefined();
    expect(idx.workerVersions).toBeDefined();
  });
});
