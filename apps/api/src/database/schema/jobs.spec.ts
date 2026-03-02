import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { jobStatusEnum, jobExecutions } from './jobs';

describe('jobStatusEnum', () => {
  it('is defined', () => {
    expect(jobStatusEnum).toBeDefined();
  });

  it('has all required enum values', () => {
    const values = jobStatusEnum.enumValues;
    expect(values).toContain('QUEUED');
    expect(values).toContain('RUNNING');
    expect(values).toContain('COMPLETED');
    expect(values).toContain('STUCK');
    expect(values).toContain('ERROR');
    expect(values).toContain('CANCELLED');
    expect(values).toHaveLength(6);
  });
});

describe('jobExecutions table', () => {
  it('is defined', () => {
    expect(jobExecutions).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(jobExecutions[Symbol.for('drizzle:Name')]).toBe('job_executions');
  });

  it('has all required columns', () => {
    expect(jobExecutions.id).toBeDefined();
    expect(jobExecutions.packageId).toBeDefined();
    expect(jobExecutions.workerVersionId).toBeDefined();
    expect(jobExecutions.status).toBeDefined();
    expect(jobExecutions.containerId).toBeDefined();
    expect(jobExecutions.startedAt).toBeDefined();
    expect(jobExecutions.completedAt).toBeDefined();
    expect(jobExecutions.errorMessage).toBeDefined();
    expect(jobExecutions.retryCount).toBeDefined();
    expect(jobExecutions.logs).toBeDefined();
    expect(jobExecutions.createdAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(jobExecutions.id.columnType).toBe('PgUUID');
  });

  it('packageId column is uuid and not null', () => {
    expect(jobExecutions.packageId.columnType).toBe('PgUUID');
    expect(jobExecutions.packageId.notNull).toBe(true);
  });

  it('workerVersionId column is uuid and not null', () => {
    expect(jobExecutions.workerVersionId.columnType).toBe('PgUUID');
    expect(jobExecutions.workerVersionId.notNull).toBe(true);
  });

  it('status column references jobStatus enum and not null', () => {
    expect(jobExecutions.status.columnType).toBe('PgEnumColumn');
    expect(jobExecutions.status.notNull).toBe(true);
  });

  it('containerId column is varchar and nullable', () => {
    expect(jobExecutions.containerId.columnType).toBe('PgVarchar');
    expect(jobExecutions.containerId.notNull).toBe(false);
  });

  it('startedAt column is timestamp and nullable', () => {
    expect(jobExecutions.startedAt.columnType).toBe('PgTimestamp');
    expect(jobExecutions.startedAt.notNull).toBe(false);
  });

  it('completedAt column is timestamp and nullable', () => {
    expect(jobExecutions.completedAt.columnType).toBe('PgTimestamp');
    expect(jobExecutions.completedAt.notNull).toBe(false);
  });

  it('errorMessage column is text and nullable', () => {
    expect(jobExecutions.errorMessage.columnType).toBe('PgText');
    expect(jobExecutions.errorMessage.notNull).toBe(false);
  });

  it('retryCount column is integer and not null', () => {
    expect(jobExecutions.retryCount.columnType).toBe('PgInteger');
    expect(jobExecutions.retryCount.notNull).toBe(true);
  });

  it('logs column is jsonb and not null', () => {
    expect(jobExecutions.logs.columnType).toBe('PgJsonb');
    expect(jobExecutions.logs.notNull).toBe(true);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(jobExecutions.createdAt.columnType).toBe('PgTimestamp');
    expect(jobExecutions.createdAt.notNull).toBe(true);
  });

  it('has indexes on packageId, status, and workerVersionId', () => {
    const config = getTableConfig(jobExecutions);
    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain('job_executions_package_id_idx');
    expect(indexNames).toContain('job_executions_status_idx');
    expect(indexNames).toContain('job_executions_worker_version_id_idx');
  });
});

describe('schema/index re-exports jobs', () => {
  it('re-exports jobStatusEnum and jobExecutions', async () => {
    const idx = await import('./index');
    expect(idx.jobStatusEnum).toBeDefined();
    expect(idx.jobExecutions).toBeDefined();
  });
});
