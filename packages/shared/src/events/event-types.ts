import type { WorkerState } from '../constants/enums.js';
import type { RoutingKeys } from './routing-keys.js';

export interface SmithyEvent<T = unknown> {
  eventType: string;
  timestamp: string;
  correlationId: string;
  payload: T;
}

export type PackageCreatedEvent = SmithyEvent<{
  packageId: string;
  type: string;
  metadata: Record<string, unknown>;
  createdBy?: string;
}>;

export type WorkerStateChangedEvent = SmithyEvent<{
  jobExecutionId: string;
  workerId: string;
  workerVersionId: string;
  previousState: WorkerState;
  newState: WorkerState;
  packageId: string;
}>;

export type JobStartedEvent = SmithyEvent<{
  jobExecutionId: string;
  packageId: string;
  workerVersionId: string;
  containerId?: string;
}>;

export type JobCompletedEvent = SmithyEvent<{
  jobExecutionId: string;
  packageId: string;
  workerVersionId: string;
  outputPackageId?: string;
  duration: number;
}>;

export type JobStuckEvent = SmithyEvent<{
  jobExecutionId: string;
  packageId: string;
  workerVersionId: string;
  reason: string;
  stuckSince: string;
}>;

export type JobErrorEvent = SmithyEvent<{
  jobExecutionId: string;
  packageId: string;
  workerVersionId: string;
  error: { message: string; stack?: string };
  retryCount: number;
  willRetry: boolean;
}>;

export type AssemblyLineCompletedEvent = SmithyEvent<{
  assemblyLineId: string;
  packageId: string;
  totalSteps: number;
  totalDuration: number;
}>;

export interface EventTypeMap {
  [RoutingKeys.PACKAGE_CREATED]: PackageCreatedEvent;
  [RoutingKeys.JOB_STATE_CHANGED]: WorkerStateChangedEvent;
  [RoutingKeys.JOB_STARTED]: JobStartedEvent;
  [RoutingKeys.JOB_COMPLETED]: JobCompletedEvent;
  [RoutingKeys.JOB_STUCK]: JobStuckEvent;
  [RoutingKeys.JOB_ERROR]: JobErrorEvent;
  [RoutingKeys.ASSEMBLY_LINE_COMPLETED]: AssemblyLineCompletedEvent;
}
