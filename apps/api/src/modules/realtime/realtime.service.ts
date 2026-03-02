import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { SMITHY_EVENTS_EXCHANGE } from '../events/events.module';
import type { EventEnvelope } from '../events/event.types';
import { WorkflowsGateway } from './workflows.gateway';
import { InteractiveGateway } from './interactive.gateway';

// ── Human-readable state display names ──────────────────────────────────────

const STATE_DISPLAY_NAMES: Record<string, string> = {
  WAITING: 'Waiting',
  WORKING: 'In Progress',
  DONE: 'Completed',
  STUCK: 'Stuck',
  ERROR: 'Error',
  QUEUED: 'Queued',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  PENDING: 'Pending',
  IN_TRANSIT: 'In Transit',
  PROCESSING: 'Processing',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};

function displayState(state: string): string {
  return STATE_DISPLAY_NAMES[state] ?? state;
}

// ── Client-friendly payload types ───────────────────────────────────────────

export interface ClientJobStatePayload {
  jobId: string;
  state: string;
  stateDisplay: string;
  previousState: string;
  previousStateDisplay: string;
  workerId: string;
  workerVersionId: string;
  updatedAt: string;
  correlationId: string;
}

export interface ClientPackageStatusPayload {
  packageId: string;
  type: string;
  createdAt: string;
  correlationId: string;
}

export interface ClientAssemblyLineCompletedPayload {
  assemblyLineId: string;
  packageId: string;
  totalSteps: number;
  totalDuration: number;
  completedAt: string;
  correlationId: string;
}

export interface ClientAssemblyLineProgressPayload {
  assemblyLineId: string;
  stepIndex: number;
  stepName: string;
  packageId: string;
  duration: number;
  completedAt: string;
  correlationId: string;
}

export interface ClientInteractiveQuestionPayload {
  jobId: string;
  reason: string;
  stuckSince: string;
  correlationId: string;
}

// ── Enriched payload fields (set by publishers for routing) ─────────────────

interface EnrichedPayload extends Record<string, unknown> {
  assemblyLineSlug?: string;
  workerPoolSlug?: string;
}

// ── Bridge service ──────────────────────────────────────────────────────────

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private readonly workflowsGateway: WorkflowsGateway,
    private readonly interactiveGateway: InteractiveGateway,
  ) {}

  // ── job.state.changed → job:{jobId} room + assembly-line:{slug} room ────

  @RabbitSubscribe({
    exchange: SMITHY_EVENTS_EXCHANGE,
    routingKey: 'job.state.changed',
    queue: 'smithy.realtime.job-state',
    queueOptions: { durable: true },
  })
  handleJobStateChanged(
    envelope: EventEnvelope<EnrichedPayload>,
  ): void {
    try {
      const { payload, correlationId, timestamp } = envelope;

      const clientPayload: ClientJobStatePayload = {
        jobId: String(payload.jobExecutionId ?? ''),
        state: String(payload.newState ?? ''),
        stateDisplay: displayState(String(payload.newState ?? '')),
        previousState: String(payload.previousState ?? ''),
        previousStateDisplay: displayState(String(payload.previousState ?? '')),
        workerId: String(payload.workerId ?? ''),
        workerVersionId: String(payload.workerVersionId ?? ''),
        updatedAt: timestamp,
        correlationId,
      };

      // Emit to job:{jobId} room via workflow gateway
      const jobId = clientPayload.jobId;
      if (jobId) {
        this.workflowsGateway.emitToRoom(
          `job:${jobId}`,
          'job:state',
          clientPayload,
        );
      }

      // Emit to assembly-line:{slug} room if slug is available
      const slug = payload.assemblyLineSlug;
      const poolSlug = payload.workerPoolSlug ?? null;
      if (slug) {
        this.workflowsGateway.broadcastJobState(
          String(slug),
          poolSlug ? String(poolSlug) : null,
          clientPayload,
        );
      }

      this.logger.debug(
        `Bridge: job.state.changed → job:${jobId} correlationId=${correlationId}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        'Failed to bridge job.state.changed event',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // ── package.created → assembly-line:{slug} room ──────────────────────────

  @RabbitSubscribe({
    exchange: SMITHY_EVENTS_EXCHANGE,
    routingKey: 'package.created',
    queue: 'smithy.realtime.package-created',
    queueOptions: { durable: true },
  })
  handlePackageCreated(
    envelope: EventEnvelope<EnrichedPayload>,
  ): void {
    try {
      const { payload, correlationId, timestamp } = envelope;

      const clientPayload: ClientPackageStatusPayload = {
        packageId: String(payload.packageId ?? ''),
        type: String(payload.type ?? ''),
        createdAt: timestamp,
        correlationId,
      };

      const slug = payload.assemblyLineSlug;
      if (slug) {
        this.workflowsGateway.broadcastPackageStatus(
          String(slug),
          clientPayload,
        );
        this.logger.debug(
          `Bridge: package.created → assembly-line:${slug} correlationId=${correlationId}`,
        );
      } else {
        this.logger.warn(
          `Bridge: package.created missing assemblyLineSlug, skipping room emission correlationId=${correlationId}`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        'Failed to bridge package.created event',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // ── assembly-line.completed → assembly-line:{slug} room ──────────────────

  @RabbitSubscribe({
    exchange: SMITHY_EVENTS_EXCHANGE,
    routingKey: 'assembly-line.completed',
    queue: 'smithy.realtime.assembly-line-completed',
    queueOptions: { durable: true },
  })
  handleAssemblyLineCompleted(
    envelope: EventEnvelope<EnrichedPayload>,
  ): void {
    try {
      const { payload, correlationId, timestamp } = envelope;

      const clientPayload: ClientAssemblyLineCompletedPayload = {
        assemblyLineId: String(payload.assemblyLineId ?? ''),
        packageId: String(payload.packageId ?? ''),
        totalSteps: Number(payload.totalSteps ?? 0),
        totalDuration: Number(payload.totalDuration ?? 0),
        completedAt: timestamp,
        correlationId,
      };

      const slug = payload.assemblyLineSlug;
      if (slug) {
        this.workflowsGateway.broadcastAssemblyLineCompleted(
          String(slug),
          clientPayload,
        );
        this.logger.debug(
          `Bridge: assembly-line.completed → assembly-line:${slug} correlationId=${correlationId}`,
        );
      } else {
        this.logger.warn(
          `Bridge: assembly-line.completed missing assemblyLineSlug, skipping room emission correlationId=${correlationId}`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        'Failed to bridge assembly-line.completed event',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // ── assembly-line.step.completed → assembly-line:{slug} room ─────────────

  @RabbitSubscribe({
    exchange: SMITHY_EVENTS_EXCHANGE,
    routingKey: 'assembly-line.step.completed',
    queue: 'smithy.realtime.assembly-line-step',
    queueOptions: { durable: true },
  })
  handleAssemblyLineStepCompleted(
    envelope: EventEnvelope<EnrichedPayload>,
  ): void {
    try {
      const { payload, correlationId, timestamp } = envelope;

      const clientPayload: ClientAssemblyLineProgressPayload = {
        assemblyLineId: String(payload.assemblyLineId ?? ''),
        stepIndex: Number(payload.stepIndex ?? 0),
        stepName: String(payload.stepName ?? ''),
        packageId: String(payload.packageId ?? ''),
        duration: Number(payload.duration ?? 0),
        completedAt: timestamp,
        correlationId,
      };

      const slug = payload.assemblyLineSlug;
      if (slug) {
        this.workflowsGateway.broadcastAssemblyLineProgress(
          String(slug),
          clientPayload,
        );
        this.logger.debug(
          `Bridge: assembly-line.step.completed → assembly-line:${slug} correlationId=${correlationId}`,
        );
      } else {
        this.logger.warn(
          `Bridge: assembly-line.step.completed missing assemblyLineSlug, skipping room emission correlationId=${correlationId}`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        'Failed to bridge assembly-line.step.completed event',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // ── job.stuck → job:{jobId} room (via interactive gateway) ───────────────

  @RabbitSubscribe({
    exchange: SMITHY_EVENTS_EXCHANGE,
    routingKey: 'job.stuck',
    queue: 'smithy.realtime.job-stuck',
    queueOptions: { durable: true },
  })
  handleJobStuck(
    envelope: EventEnvelope<EnrichedPayload>,
  ): void {
    try {
      const { payload, correlationId, timestamp } = envelope;

      const jobId = String(payload.jobExecutionId ?? '');

      this.interactiveGateway.emitQuestion({
        jobId,
        questionId: correlationId,
        question: String(payload.reason ?? 'Job is stuck and needs input'),
        askedAt: timestamp,
      });

      this.logger.debug(
        `Bridge: job.stuck → job:${jobId} (interactive:question) correlationId=${correlationId}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        'Failed to bridge job.stuck event',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
