import type { JobStatus } from '../constants/enums.js';

export interface RetryStrategy {
  type: 'immediate' | 'backoff' | 'skip';
  maxRetries?: number;
}

export interface JobExecution {
  id: string;
  packageId: string;
  workerVersionId: string;
  status: JobStatus;
  containerId?: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  retryCount: number;
  logs: unknown[];
  createdAt: string;
}
