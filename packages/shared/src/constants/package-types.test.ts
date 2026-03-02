import { describe, it, expect } from 'vitest';
import { PackageType } from './package-types.js';

describe('PackageType', () => {
  it('has all required values', () => {
    expect(PackageType.USER_INPUT).toBe('USER_INPUT');
    expect(PackageType.SPECIFICATION).toBe('SPECIFICATION');
    expect(PackageType.CODE).toBe('CODE');
    expect(PackageType.IMAGE).toBe('IMAGE');
    expect(PackageType.PULL_REQUEST).toBe('PULL_REQUEST');
  });

  it('has exactly 5 values', () => {
    expect(Object.keys(PackageType)).toHaveLength(5);
  });

  it('is usable as a runtime value for iteration', () => {
    const values = Object.values(PackageType);
    expect(values).toContain('USER_INPUT');
    expect(values).toContain('SPECIFICATION');
    expect(values).toContain('CODE');
    expect(values).toContain('IMAGE');
    expect(values).toContain('PULL_REQUEST');
  });

  it('is usable as a type for comparison', () => {
    const type: PackageType = PackageType.CODE;
    expect(type).toBe('CODE');
  });
});
