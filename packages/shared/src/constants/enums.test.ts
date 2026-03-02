import { describe, it, expect } from 'vitest';
import { WorkerState, PackageStatus, JobStatus } from './enums.js';

describe('WorkerState', () => {
  it('has all required values', () => {
    expect(WorkerState.WAITING).toBe('WAITING');
    expect(WorkerState.WORKING).toBe('WORKING');
    expect(WorkerState.DONE).toBe('DONE');
    expect(WorkerState.STUCK).toBe('STUCK');
    expect(WorkerState.ERROR).toBe('ERROR');
  });

  it('has exactly 5 values', () => {
    expect(Object.keys(WorkerState)).toHaveLength(5);
  });

  it('is usable as a runtime value for iteration', () => {
    const values = Object.values(WorkerState);
    expect(values).toContain('WAITING');
    expect(values).toContain('WORKING');
    expect(values).toContain('DONE');
    expect(values).toContain('STUCK');
    expect(values).toContain('ERROR');
  });

  it('is usable as a type for comparison', () => {
    const state: WorkerState = WorkerState.WAITING;
    expect(state).toBe('WAITING');
  });
});

describe('PackageStatus', () => {
  it('has all required values', () => {
    expect(PackageStatus.PENDING).toBe('PENDING');
    expect(PackageStatus.IN_TRANSIT).toBe('IN_TRANSIT');
    expect(PackageStatus.PROCESSING).toBe('PROCESSING');
    expect(PackageStatus.COMPLETED).toBe('COMPLETED');
    expect(PackageStatus.FAILED).toBe('FAILED');
    expect(PackageStatus.EXPIRED).toBe('EXPIRED');
  });

  it('has exactly 6 values', () => {
    expect(Object.keys(PackageStatus)).toHaveLength(6);
  });

  it('is usable as a runtime value for iteration', () => {
    const values = Object.values(PackageStatus);
    expect(values).toContain('PENDING');
    expect(values).toContain('IN_TRANSIT');
    expect(values).toContain('PROCESSING');
    expect(values).toContain('COMPLETED');
    expect(values).toContain('FAILED');
    expect(values).toContain('EXPIRED');
  });

  it('is usable as a type for comparison', () => {
    const status: PackageStatus = PackageStatus.COMPLETED;
    expect(status).toBe('COMPLETED');
  });

  it('matches the PostgreSQL enum values defined in the Drizzle schema', () => {
    const pgEnumValues = ['PENDING', 'IN_TRANSIT', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'];
    expect(Object.values(PackageStatus)).toEqual(pgEnumValues);
  });
});

describe('JobStatus', () => {
  it('has all required values', () => {
    expect(JobStatus.QUEUED).toBe('QUEUED');
    expect(JobStatus.RUNNING).toBe('RUNNING');
    expect(JobStatus.COMPLETED).toBe('COMPLETED');
    expect(JobStatus.STUCK).toBe('STUCK');
    expect(JobStatus.ERROR).toBe('ERROR');
    expect(JobStatus.CANCELLED).toBe('CANCELLED');
  });

  it('has exactly 6 values', () => {
    expect(Object.keys(JobStatus)).toHaveLength(6);
  });

  it('is usable as a runtime value for iteration', () => {
    const values = Object.values(JobStatus);
    expect(values).toContain('QUEUED');
    expect(values).toContain('RUNNING');
    expect(values).toContain('COMPLETED');
    expect(values).toContain('STUCK');
    expect(values).toContain('ERROR');
    expect(values).toContain('CANCELLED');
  });

  it('is usable as a type for comparison', () => {
    const status: JobStatus = JobStatus.RUNNING;
    expect(status).toBe('RUNNING');
  });

  it('matches the PostgreSQL enum values defined in the Drizzle schema', () => {
    const pgEnumValues = ['QUEUED', 'RUNNING', 'COMPLETED', 'STUCK', 'ERROR', 'CANCELLED'];
    expect(Object.values(JobStatus)).toEqual(pgEnumValues);
  });
});
