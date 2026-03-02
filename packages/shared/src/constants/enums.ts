export const WorkerState = {
  WAITING: 'WAITING',
  WORKING: 'WORKING',
  DONE: 'DONE',
  STUCK: 'STUCK',
  ERROR: 'ERROR',
} as const;
export type WorkerState = (typeof WorkerState)[keyof typeof WorkerState];

export const PackageStatus = {
  PENDING: 'PENDING',
  IN_TRANSIT: 'IN_TRANSIT',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;
export type PackageStatus = (typeof PackageStatus)[keyof typeof PackageStatus];

export const JobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  STUCK: 'STUCK',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELLED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
