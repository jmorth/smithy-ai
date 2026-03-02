import { describe, it, expect } from 'vitest';
import { STORAGE_KEY_PREFIXES, buildStorageKey } from './storage.constants';

describe('STORAGE_KEY_PREFIXES', () => {
  it('defines PACKAGES prefix', () => {
    expect(STORAGE_KEY_PREFIXES.PACKAGES).toBe('packages');
  });

  it('defines WORKERS prefix', () => {
    expect(STORAGE_KEY_PREFIXES.WORKERS).toBe('workers');
  });

  it('defines BUILDS prefix', () => {
    expect(STORAGE_KEY_PREFIXES.BUILDS).toBe('builds');
  });
});

describe('buildStorageKey', () => {
  it('combines prefix, entityId, and filename with slashes', () => {
    expect(buildStorageKey('packages', 'abc-123', 'file.zip')).toBe('packages/abc-123/file.zip');
  });

  it('works with workers prefix', () => {
    expect(buildStorageKey('workers', 'worker-1', 'output.bin')).toBe('workers/worker-1/output.bin');
  });

  it('works with builds prefix', () => {
    expect(buildStorageKey('builds', 'build-99', 'artifact.tar.gz')).toBe('builds/build-99/artifact.tar.gz');
  });
});
