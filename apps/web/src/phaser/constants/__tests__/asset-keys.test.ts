import { describe, it, expect } from 'vitest';
import { ASSET_KEYS } from '../asset-keys';
import type { AssetKey } from '../asset-keys';

describe('ASSET_KEYS', () => {
  it('defines all required asset keys', () => {
    expect(ASSET_KEYS.FLOOR_TILE).toBe('floor-tile');
    expect(ASSET_KEYS.WALL_SEGMENT).toBe('wall-segment');
    expect(ASSET_KEYS.CONVEYOR_BELT).toBe('conveyor-belt');
    expect(ASSET_KEYS.WORKER_MACHINE).toBe('worker-machine');
    expect(ASSET_KEYS.PACKAGE_CRATE).toBe('package-crate');
  });

  it('contains exactly 5 keys', () => {
    expect(Object.keys(ASSET_KEYS)).toHaveLength(5);
  });

  it('has unique values', () => {
    const values = Object.values(ASSET_KEYS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('values are usable as AssetKey type', () => {
    const key: AssetKey = ASSET_KEYS.FLOOR_TILE;
    expect(key).toBe('floor-tile');
  });

  it('is a const object (values are string literals)', () => {
    // Verify values are strings (runtime check for the const assertion)
    for (const value of Object.values(ASSET_KEYS)) {
      expect(typeof value).toBe('string');
    }
  });
});
