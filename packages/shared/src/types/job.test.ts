import { describe, it, expect } from 'vitest';
import type { JobExecution, RetryStrategy } from './job.js';
import { JobStatus } from '../constants/enums.js';

describe('RetryStrategy interface', () => {
  it('accepts type "immediate"', () => {
    const strategy: RetryStrategy = { type: 'immediate' };
    expect(strategy.type).toBe('immediate');
  });

  it('accepts type "backoff"', () => {
    const strategy: RetryStrategy = { type: 'backoff', maxRetries: 3 };
    expect(strategy.type).toBe('backoff');
    expect(strategy.maxRetries).toBe(3);
  });

  it('accepts type "skip"', () => {
    const strategy: RetryStrategy = { type: 'skip' };
    expect(strategy.type).toBe('skip');
  });

  it('maxRetries is optional', () => {
    const withoutMax: RetryStrategy = { type: 'immediate' };
    const withMax: RetryStrategy = { type: 'backoff', maxRetries: 5 };
    expect(withoutMax.maxRetries).toBeUndefined();
    expect(withMax.maxRetries).toBe(5);
  });

  it('covers all valid retry types', () => {
    const types: RetryStrategy['type'][] = ['immediate', 'backoff', 'skip'];
    expect(types).toHaveLength(3);
    types.forEach((t) => expect(typeof t).toBe('string'));
  });
});

describe('JobExecution interface', () => {
  it('accepts a valid JobExecution with required fields', () => {
    const job: JobExecution = {
      id: 'job-1',
      packageId: 'pkg-1',
      workerVersionId: 'wv-1',
      status: JobStatus.QUEUED,
      retryCount: 0,
      logs: [],
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(job.id).toBe('job-1');
    expect(job.packageId).toBe('pkg-1');
    expect(job.workerVersionId).toBe('wv-1');
    expect(job.status).toBe(JobStatus.QUEUED);
    expect(job.retryCount).toBe(0);
    expect(job.logs).toEqual([]);
  });

  it('accepts a JobExecution with all optional fields', () => {
    const job: JobExecution = {
      id: 'job-2',
      packageId: 'pkg-2',
      workerVersionId: 'wv-2',
      status: JobStatus.COMPLETED,
      containerId: 'container-abc123',
      startedAt: '2024-01-01T00:01:00Z',
      completedAt: '2024-01-01T00:02:00Z',
      errorMessage: undefined,
      retryCount: 0,
      logs: [{ level: 'info', message: 'done' }],
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(job.containerId).toBe('container-abc123');
    expect(job.startedAt).toBe('2024-01-01T00:01:00Z');
    expect(job.completedAt).toBe('2024-01-01T00:02:00Z');
    expect(job.logs).toHaveLength(1);
  });

  it('accepts a JobExecution with errorMessage for failed jobs', () => {
    const job: JobExecution = {
      id: 'job-3',
      packageId: 'pkg-3',
      workerVersionId: 'wv-1',
      status: JobStatus.ERROR,
      errorMessage: 'Container OOM',
      retryCount: 2,
      logs: ['attempt 1', 'attempt 2'],
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(job.status).toBe(JobStatus.ERROR);
    expect(job.errorMessage).toBe('Container OOM');
    expect(job.retryCount).toBe(2);
  });

  it('status field uses JobStatus values', () => {
    const statuses: JobExecution['status'][] = [
      JobStatus.QUEUED,
      JobStatus.RUNNING,
      JobStatus.COMPLETED,
      JobStatus.STUCK,
      JobStatus.ERROR,
      JobStatus.CANCELLED,
    ];
    expect(statuses).toHaveLength(6);
    statuses.forEach((s) => expect(typeof s).toBe('string'));
  });

  it('logs is an array accepting any shape', () => {
    const job: JobExecution = {
      id: 'job-4',
      packageId: 'pkg-4',
      workerVersionId: 'wv-1',
      status: JobStatus.RUNNING,
      retryCount: 0,
      logs: [
        { timestamp: '2024-01-01T00:00:01Z', level: 'info', message: 'Starting' },
        { timestamp: '2024-01-01T00:00:02Z', level: 'error', message: 'Failed', code: 42 },
        'plain string log',
      ],
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(Array.isArray(job.logs)).toBe(true);
    expect(job.logs).toHaveLength(3);
  });
});
