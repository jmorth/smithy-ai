export const STORAGE_KEY_PREFIXES = {
  PACKAGES: 'packages',
  WORKERS: 'workers',
  BUILDS: 'builds',
} as const;

export type StorageKeyPrefix = (typeof STORAGE_KEY_PREFIXES)[keyof typeof STORAGE_KEY_PREFIXES];

/**
 * Build a hierarchical S3 key following the convention: {prefix}/{entityId}/{filename}
 */
export function buildStorageKey(prefix: StorageKeyPrefix, entityId: string, filename: string): string {
  return `${prefix}/${entityId}/${filename}`;
}
