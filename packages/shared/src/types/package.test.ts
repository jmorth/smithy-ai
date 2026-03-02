import { describe, it, expect } from 'vitest';
import type { Package, PackageFile } from './package.js';
import { PackageStatus } from '../constants/enums.js';
import { PackageType } from '../constants/package-types.js';

describe('Package interface', () => {
  it('accepts a valid Package with all required fields', () => {
    const pkg: Package = {
      id: 'pkg-1',
      type: PackageType.USER_INPUT,
      status: PackageStatus.PENDING,
      metadata: {},
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(pkg.id).toBe('pkg-1');
    expect(pkg.type).toBe(PackageType.USER_INPUT);
    expect(pkg.status).toBe(PackageStatus.PENDING);
    expect(pkg.metadata).toEqual({});
  });

  it('accepts a Package with all optional fields populated', () => {
    const pkg: Package = {
      id: 'pkg-2',
      type: PackageType.CODE,
      status: PackageStatus.PROCESSING,
      metadata: { key: 'value', count: 42 },
      assemblyLineId: 'al-1',
      currentStep: 2,
      createdBy: 'user-1',
      deletedAt: '2024-06-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z',
    };
    expect(pkg.assemblyLineId).toBe('al-1');
    expect(pkg.currentStep).toBe(2);
    expect(pkg.createdBy).toBe('user-1');
    expect(pkg.deletedAt).toBe('2024-06-01T00:00:00Z');
  });

  it('accepts metadata with mixed unknown value types', () => {
    const pkg: Package = {
      id: 'pkg-3',
      type: PackageType.SPECIFICATION,
      status: PackageStatus.COMPLETED,
      metadata: {
        nested: { key: 'val' },
        list: [1, 2, 3],
        flag: true,
        count: 0,
      },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(typeof pkg.metadata).toBe('object');
    expect(pkg.metadata['list']).toEqual([1, 2, 3]);
  });

  it('status field uses PackageStatus values', () => {
    const statuses: Package['status'][] = [
      PackageStatus.PENDING,
      PackageStatus.IN_TRANSIT,
      PackageStatus.PROCESSING,
      PackageStatus.COMPLETED,
      PackageStatus.FAILED,
      PackageStatus.EXPIRED,
    ];
    expect(statuses).toHaveLength(6);
    statuses.forEach((s) => expect(typeof s).toBe('string'));
  });
});

describe('PackageFile interface', () => {
  it('accepts a valid PackageFile with all required fields', () => {
    const file: PackageFile = {
      id: 'file-1',
      packageId: 'pkg-1',
      fileKey: 'uploads/pkg-1/spec.pdf',
      filename: 'spec.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 204800,
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(file.id).toBe('file-1');
    expect(file.packageId).toBe('pkg-1');
    expect(file.fileKey).toBe('uploads/pkg-1/spec.pdf');
    expect(file.filename).toBe('spec.pdf');
    expect(file.mimeType).toBe('application/pdf');
    expect(file.sizeBytes).toBe(204800);
    expect(file.createdAt).toBe('2024-01-01T00:00:00Z');
  });

  it('sizeBytes is numeric', () => {
    const file: PackageFile = {
      id: 'file-2',
      packageId: 'pkg-2',
      fileKey: 'uploads/pkg-2/image.png',
      filename: 'image.png',
      mimeType: 'image/png',
      sizeBytes: 0,
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(typeof file.sizeBytes).toBe('number');
  });
});
