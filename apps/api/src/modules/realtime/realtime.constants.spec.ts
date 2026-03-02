import { describe, it, expect } from 'vitest';
import {
  REALTIME_NAMESPACE_WORKFLOWS,
  REALTIME_NAMESPACE_JOBS,
  REALTIME_NAMESPACE_INTERACTIVE,
} from './realtime.constants';

describe('realtime constants', () => {
  it('defines /workflows namespace', () => {
    expect(REALTIME_NAMESPACE_WORKFLOWS).toBe('/workflows');
  });

  it('defines /jobs namespace', () => {
    expect(REALTIME_NAMESPACE_JOBS).toBe('/jobs');
  });

  it('defines /interactive namespace', () => {
    expect(REALTIME_NAMESPACE_INTERACTIVE).toBe('/interactive');
  });
});
