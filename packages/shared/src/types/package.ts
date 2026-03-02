import type { PackageStatus } from '../constants/enums.js';
import type { PackageType } from '../constants/package-types.js';

export interface Package {
  id: string;
  type: PackageType;
  status: PackageStatus;
  metadata: Record<string, unknown>;
  assemblyLineId?: string;
  currentStep?: number;
  createdBy?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PackageFile {
  id: string;
  packageId: string;
  fileKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}
