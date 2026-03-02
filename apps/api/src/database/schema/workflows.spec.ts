import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  assemblyLineStatusEnum,
  workerPoolStatusEnum,
  assemblyLines,
  assemblyLineSteps,
  workerPools,
  workerPoolMembers,
} from './workflows';

describe('assemblyLineStatusEnum', () => {
  it('is defined', () => {
    expect(assemblyLineStatusEnum).toBeDefined();
  });

  it('has enumValues with ACTIVE, PAUSED, and ARCHIVED', () => {
    const values = assemblyLineStatusEnum.enumValues;
    expect(values).toContain('ACTIVE');
    expect(values).toContain('PAUSED');
    expect(values).toContain('ARCHIVED');
    expect(values).toHaveLength(3);
  });
});

describe('workerPoolStatusEnum', () => {
  it('is defined', () => {
    expect(workerPoolStatusEnum).toBeDefined();
  });

  it('has enumValues with ACTIVE, PAUSED, and ARCHIVED', () => {
    const values = workerPoolStatusEnum.enumValues;
    expect(values).toContain('ACTIVE');
    expect(values).toContain('PAUSED');
    expect(values).toContain('ARCHIVED');
    expect(values).toHaveLength(3);
  });
});

describe('assemblyLines table', () => {
  it('is defined', () => {
    expect(assemblyLines).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(assemblyLines[Symbol.for('drizzle:Name')]).toBe('assembly_lines');
  });

  it('has all required columns', () => {
    expect(assemblyLines.id).toBeDefined();
    expect(assemblyLines.name).toBeDefined();
    expect(assemblyLines.slug).toBeDefined();
    expect(assemblyLines.description).toBeDefined();
    expect(assemblyLines.status).toBeDefined();
    expect(assemblyLines.createdAt).toBeDefined();
    expect(assemblyLines.updatedAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(assemblyLines.id.columnType).toBe('PgUUID');
  });

  it('name column is varchar and not null', () => {
    expect(assemblyLines.name.columnType).toBe('PgVarchar');
    expect(assemblyLines.name.notNull).toBe(true);
  });

  it('slug column is varchar, not null, and unique', () => {
    expect(assemblyLines.slug.columnType).toBe('PgVarchar');
    expect(assemblyLines.slug.notNull).toBe(true);
    expect(assemblyLines.slug.isUnique).toBe(true);
  });

  it('description column is text and nullable', () => {
    expect(assemblyLines.description.columnType).toBe('PgText');
    expect(assemblyLines.description.notNull).toBe(false);
  });

  it('status column references assemblyLineStatusEnum and is not null', () => {
    expect(assemblyLines.status.columnType).toBe('PgEnumColumn');
    expect(assemblyLines.status.notNull).toBe(true);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(assemblyLines.createdAt.columnType).toBe('PgTimestamp');
    expect(assemblyLines.createdAt.notNull).toBe(true);
  });

  it('updatedAt column is timestamp and not null', () => {
    expect(assemblyLines.updatedAt.columnType).toBe('PgTimestamp');
    expect(assemblyLines.updatedAt.notNull).toBe(true);
  });
});

describe('assemblyLineSteps table', () => {
  it('is defined', () => {
    expect(assemblyLineSteps).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(assemblyLineSteps[Symbol.for('drizzle:Name')]).toBe('assembly_line_steps');
  });

  it('has all required columns', () => {
    expect(assemblyLineSteps.id).toBeDefined();
    expect(assemblyLineSteps.assemblyLineId).toBeDefined();
    expect(assemblyLineSteps.stepNumber).toBeDefined();
    expect(assemblyLineSteps.workerVersionId).toBeDefined();
    expect(assemblyLineSteps.configOverrides).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(assemblyLineSteps.id.columnType).toBe('PgUUID');
  });

  it('assemblyLineId column is uuid and not null', () => {
    expect(assemblyLineSteps.assemblyLineId.columnType).toBe('PgUUID');
    expect(assemblyLineSteps.assemblyLineId.notNull).toBe(true);
  });

  it('stepNumber column is integer and not null', () => {
    expect(assemblyLineSteps.stepNumber.columnType).toBe('PgInteger');
    expect(assemblyLineSteps.stepNumber.notNull).toBe(true);
  });

  it('workerVersionId column is uuid and not null', () => {
    expect(assemblyLineSteps.workerVersionId.columnType).toBe('PgUUID');
    expect(assemblyLineSteps.workerVersionId.notNull).toBe(true);
  });

  it('configOverrides column is jsonb and nullable', () => {
    expect(assemblyLineSteps.configOverrides.columnType).toBe('PgJsonb');
    expect(assemblyLineSteps.configOverrides.notNull).toBe(false);
  });

  it('has a composite unique constraint on (assembly_line_id, step_number)', () => {
    const config = getTableConfig(assemblyLineSteps);
    expect(config.uniqueConstraints).toHaveLength(1);
    const cols = config.uniqueConstraints[0].columns.map((c) => c.name);
    expect(cols).toContain('assembly_line_id');
    expect(cols).toContain('step_number');
  });
});

describe('workerPools table', () => {
  it('is defined', () => {
    expect(workerPools).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(workerPools[Symbol.for('drizzle:Name')]).toBe('worker_pools');
  });

  it('has all required columns', () => {
    expect(workerPools.id).toBeDefined();
    expect(workerPools.name).toBeDefined();
    expect(workerPools.slug).toBeDefined();
    expect(workerPools.description).toBeDefined();
    expect(workerPools.status).toBeDefined();
    expect(workerPools.maxConcurrency).toBeDefined();
    expect(workerPools.createdAt).toBeDefined();
    expect(workerPools.updatedAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(workerPools.id.columnType).toBe('PgUUID');
  });

  it('name column is varchar and not null', () => {
    expect(workerPools.name.columnType).toBe('PgVarchar');
    expect(workerPools.name.notNull).toBe(true);
  });

  it('slug column is varchar, not null, and unique', () => {
    expect(workerPools.slug.columnType).toBe('PgVarchar');
    expect(workerPools.slug.notNull).toBe(true);
    expect(workerPools.slug.isUnique).toBe(true);
  });

  it('description column is text and nullable', () => {
    expect(workerPools.description.columnType).toBe('PgText');
    expect(workerPools.description.notNull).toBe(false);
  });

  it('status column references workerPoolStatusEnum and is not null', () => {
    expect(workerPools.status.columnType).toBe('PgEnumColumn');
    expect(workerPools.status.notNull).toBe(true);
  });

  it('maxConcurrency column is integer and not null', () => {
    expect(workerPools.maxConcurrency.columnType).toBe('PgInteger');
    expect(workerPools.maxConcurrency.notNull).toBe(true);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(workerPools.createdAt.columnType).toBe('PgTimestamp');
    expect(workerPools.createdAt.notNull).toBe(true);
  });

  it('updatedAt column is timestamp and not null', () => {
    expect(workerPools.updatedAt.columnType).toBe('PgTimestamp');
    expect(workerPools.updatedAt.notNull).toBe(true);
  });
});

describe('workerPoolMembers table', () => {
  it('is defined', () => {
    expect(workerPoolMembers).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(workerPoolMembers[Symbol.for('drizzle:Name')]).toBe('worker_pool_members');
  });

  it('has all required columns', () => {
    expect(workerPoolMembers.id).toBeDefined();
    expect(workerPoolMembers.poolId).toBeDefined();
    expect(workerPoolMembers.workerVersionId).toBeDefined();
    expect(workerPoolMembers.priority).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(workerPoolMembers.id.columnType).toBe('PgUUID');
  });

  it('poolId column is uuid and not null', () => {
    expect(workerPoolMembers.poolId.columnType).toBe('PgUUID');
    expect(workerPoolMembers.poolId.notNull).toBe(true);
  });

  it('workerVersionId column is uuid and not null', () => {
    expect(workerPoolMembers.workerVersionId.columnType).toBe('PgUUID');
    expect(workerPoolMembers.workerVersionId.notNull).toBe(true);
  });

  it('priority column is integer with default 0', () => {
    expect(workerPoolMembers.priority.columnType).toBe('PgInteger');
    expect(workerPoolMembers.priority.notNull).toBe(true);
  });
});

describe('schema/index re-exports workflows', () => {
  it('re-exports all workflow tables and enums', async () => {
    const idx = await import('./index');
    expect(idx.assemblyLineStatusEnum).toBeDefined();
    expect(idx.workerPoolStatusEnum).toBeDefined();
    expect(idx.assemblyLines).toBeDefined();
    expect(idx.assemblyLineSteps).toBeDefined();
    expect(idx.workerPools).toBeDefined();
    expect(idx.workerPoolMembers).toBeDefined();
  });
});
