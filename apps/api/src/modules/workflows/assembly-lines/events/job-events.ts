export const JOB_EVENTS = {
  COMPLETED: 'job.completed',
  FAILED: 'job.failed',
  STUCK: 'job.stuck',
} as const;

export type JobCompletedEvent = {
  packageId: string;
  assemblyLineSlug: string;
  completedStep: number;
  jobExecutionId: string;
};

export type JobFailedEvent = {
  packageId: string;
  assemblyLineSlug: string;
  failedStep: number;
  jobExecutionId: string;
  errorMessage: string;
};

export type JobStuckEvent = {
  packageId: string;
  assemblyLineSlug: string;
  stuckStep: number;
  jobExecutionId: string;
};
