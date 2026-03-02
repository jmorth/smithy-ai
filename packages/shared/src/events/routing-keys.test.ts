import { describe, it, expect } from 'vitest';
import { RoutingKeys } from './routing-keys.js';

describe('RoutingKeys', () => {
  it('has PACKAGE_CREATED = "package.created"', () => {
    expect(RoutingKeys.PACKAGE_CREATED).toBe('package.created');
  });

  it('has JOB_STATE_CHANGED = "job.state.changed"', () => {
    expect(RoutingKeys.JOB_STATE_CHANGED).toBe('job.state.changed');
  });

  it('has JOB_STARTED = "job.started"', () => {
    expect(RoutingKeys.JOB_STARTED).toBe('job.started');
  });

  it('has JOB_COMPLETED = "job.completed"', () => {
    expect(RoutingKeys.JOB_COMPLETED).toBe('job.completed');
  });

  it('has JOB_STUCK = "job.stuck"', () => {
    expect(RoutingKeys.JOB_STUCK).toBe('job.stuck');
  });

  it('has JOB_ERROR = "job.error"', () => {
    expect(RoutingKeys.JOB_ERROR).toBe('job.error');
  });

  it('has ASSEMBLY_LINE_COMPLETED = "assembly-line.completed"', () => {
    expect(RoutingKeys.ASSEMBLY_LINE_COMPLETED).toBe('assembly-line.completed');
  });

  it('has exactly 7 routing keys', () => {
    expect(Object.keys(RoutingKeys)).toHaveLength(7);
  });

  it('RoutingKey union type covers all values', () => {
    // This is a compile-time check; at runtime we verify the values exist
    const keys = Object.values(RoutingKeys);
    expect(keys).toContain('package.created');
    expect(keys).toContain('job.state.changed');
    expect(keys).toContain('job.started');
    expect(keys).toContain('job.completed');
    expect(keys).toContain('job.stuck');
    expect(keys).toContain('job.error');
    expect(keys).toContain('assembly-line.completed');
  });
});
