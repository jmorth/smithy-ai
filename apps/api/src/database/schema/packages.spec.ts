import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { packageStatusEnum, packages, packageFiles } from './packages';

describe('packageStatusEnum', () => {
  it('is defined', () => {
    expect(packageStatusEnum).toBeDefined();
  });

  it('has enumValues with all required statuses', () => {
    const values = packageStatusEnum.enumValues;
    expect(values).toContain('PENDING');
    expect(values).toContain('IN_TRANSIT');
    expect(values).toContain('PROCESSING');
    expect(values).toContain('COMPLETED');
    expect(values).toContain('FAILED');
    expect(values).toContain('EXPIRED');
    expect(values).toHaveLength(6);
  });
});

describe('packages table', () => {
  it('is defined', () => {
    expect(packages).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(packages[Symbol.for('drizzle:Name')]).toBe('packages');
  });

  it('has all required columns', () => {
    const cols = packages;
    expect(cols.id).toBeDefined();
    expect(cols.type).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.metadata).toBeDefined();
    expect(cols.assemblyLineId).toBeDefined();
    expect(cols.currentStep).toBeDefined();
    expect(cols.createdBy).toBeDefined();
    expect(cols.deletedAt).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    const col = packages.id.columnType;
    expect(col).toBe('PgUUID');
  });

  it('type column is varchar and not null', () => {
    expect(packages.type.columnType).toBe('PgVarchar');
    expect(packages.type.notNull).toBe(true);
  });

  it('status column references the packageStatus enum', () => {
    expect(packages.status.columnType).toBe('PgEnumColumn');
    expect(packages.status.notNull).toBe(true);
  });

  it('metadata column is jsonb and not null', () => {
    expect(packages.metadata.columnType).toBe('PgJsonb');
    expect(packages.metadata.notNull).toBe(true);
  });

  it('assemblyLineId column is uuid and nullable', () => {
    expect(packages.assemblyLineId.columnType).toBe('PgUUID');
    expect(packages.assemblyLineId.notNull).toBe(false);
  });

  it('currentStep column is integer and nullable', () => {
    expect(packages.currentStep.columnType).toBe('PgInteger');
    expect(packages.currentStep.notNull).toBe(false);
  });

  it('createdBy column is varchar and nullable', () => {
    expect(packages.createdBy.columnType).toBe('PgVarchar');
    expect(packages.createdBy.notNull).toBe(false);
  });

  it('deletedAt column is timestamp and nullable (soft delete)', () => {
    expect(packages.deletedAt.columnType).toBe('PgTimestamp');
    expect(packages.deletedAt.notNull).toBe(false);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(packages.createdAt.columnType).toBe('PgTimestamp');
    expect(packages.createdAt.notNull).toBe(true);
  });

  it('updatedAt column is timestamp and not null', () => {
    expect(packages.updatedAt.columnType).toBe('PgTimestamp');
    expect(packages.updatedAt.notNull).toBe(true);
  });
});

describe('packageFiles table', () => {
  it('is defined', () => {
    expect(packageFiles).toBeDefined();
  });

  it('has the correct table name', () => {
    expect(packageFiles[Symbol.for('drizzle:Name')]).toBe('package_files');
  });

  it('has all required columns', () => {
    expect(packageFiles.id).toBeDefined();
    expect(packageFiles.packageId).toBeDefined();
    expect(packageFiles.fileKey).toBeDefined();
    expect(packageFiles.filename).toBeDefined();
    expect(packageFiles.mimeType).toBeDefined();
    expect(packageFiles.sizeBytes).toBeDefined();
    expect(packageFiles.createdAt).toBeDefined();
  });

  it('id column is a uuid primary key', () => {
    expect(packageFiles.id.columnType).toBe('PgUUID');
  });

  it('packageId column is uuid and not null', () => {
    expect(packageFiles.packageId.columnType).toBe('PgUUID');
    expect(packageFiles.packageId.notNull).toBe(true);
  });

  it('fileKey column is varchar and not null', () => {
    expect(packageFiles.fileKey.columnType).toBe('PgVarchar');
    expect(packageFiles.fileKey.notNull).toBe(true);
  });

  it('filename column is varchar and not null', () => {
    expect(packageFiles.filename.columnType).toBe('PgVarchar');
    expect(packageFiles.filename.notNull).toBe(true);
  });

  it('mimeType column is varchar and not null', () => {
    expect(packageFiles.mimeType.columnType).toBe('PgVarchar');
    expect(packageFiles.mimeType.notNull).toBe(true);
  });

  it('sizeBytes column is bigint and not null', () => {
    expect(packageFiles.sizeBytes.columnType).toBe('PgBigInt53');
    expect(packageFiles.sizeBytes.notNull).toBe(true);
  });

  it('createdAt column is timestamp and not null', () => {
    expect(packageFiles.createdAt.columnType).toBe('PgTimestamp');
    expect(packageFiles.createdAt.notNull).toBe(true);
  });
});

describe('packages FK constraints', () => {
  it('packages table has a FK on assemblyLineId with ON DELETE SET NULL', () => {
    const config = getTableConfig(packages);
    expect(config.foreignKeys).toHaveLength(1);
    const fk = config.foreignKeys[0];
    const ref = fk.reference();
    expect(ref.foreignTable[Symbol.for('drizzle:Name')]).toBe('assembly_lines');
    expect(fk.onDelete).toBe('set null');
  });

  it('packageFiles table has a FK on packageId with ON DELETE CASCADE', () => {
    const config = getTableConfig(packageFiles);
    expect(config.foreignKeys).toHaveLength(1);
    const fk = config.foreignKeys[0];
    const ref = fk.reference();
    expect(ref.foreignTable[Symbol.for('drizzle:Name')]).toBe('packages');
    expect(fk.onDelete).toBe('cascade');
  });
});

describe('schema/index re-exports packages', () => {
  it('re-exports packageStatusEnum, packages, and packageFiles', async () => {
    const idx = await import('./index');
    expect(idx.packageStatusEnum).toBeDefined();
    expect(idx.packages).toBeDefined();
    expect(idx.packageFiles).toBeDefined();
  });
});
