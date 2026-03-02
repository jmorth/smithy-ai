import { describe, it, expect } from 'vitest';
import * as constants from './index.js';

describe('constants barrel export', () => {
  it('exports WorkerState', () => {
    expect(constants.WorkerState).toBeDefined();
    expect(typeof constants.WorkerState).toBe('object');
  });

  it('exports PackageStatus', () => {
    expect(constants.PackageStatus).toBeDefined();
    expect(typeof constants.PackageStatus).toBe('object');
  });

  it('exports JobStatus', () => {
    expect(constants.JobStatus).toBeDefined();
    expect(typeof constants.JobStatus).toBe('object');
  });

  it('exports PackageType', () => {
    expect(constants.PackageType).toBeDefined();
    expect(typeof constants.PackageType).toBe('object');
  });

  it('does not export undefined values', () => {
    for (const [key, value] of Object.entries(constants)) {
      expect(value, `export '${key}' should not be undefined`).not.toBeUndefined();
    }
  });
});
