export const RoutingKeys = {
  PACKAGE_CREATED: 'package.created',
  PACKAGE_PROCESSED: 'package.processed',
  JOB_STATE_CHANGED: 'job.state.changed',
  JOB_STARTED: 'job.started',
  JOB_COMPLETED: 'job.completed',
  JOB_STUCK: 'job.stuck',
  JOB_ERROR: 'job.error',
  ASSEMBLY_LINE_COMPLETED: 'assembly-line.completed',
  ASSEMBLY_LINE_STEP_COMPLETED: 'assembly-line.step.completed',
} as const;

export type RoutingKey = (typeof RoutingKeys)[keyof typeof RoutingKeys];
