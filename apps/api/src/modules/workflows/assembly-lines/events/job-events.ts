export const JOB_EVENTS = {
  COMPLETED: 'job.completed',
  FAILED: 'job.failed',
  STUCK: 'job.stuck',
} as const;

/**
 * Emitted by the orchestrator when a package advances to the next step.
 * Acts as a placeholder for a future RabbitMQ worker queue publish (task 067).
 */
export const WORKER_QUEUE_PUBLISH = 'worker.queue.publish';

export type WorkerQueuePublishEvent = {
  queueName: string;
  packageId: string;
  assemblyLineSlug: string;
  stepNumber: number;
};

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
