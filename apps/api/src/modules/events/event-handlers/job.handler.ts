import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SMITHY_EVENTS_EXCHANGE,
  SMITHY_EVENTS_DLX,
} from '../events.module';
import type {
  EventEnvelope,
  WorkerStateChangedEvent,
  JobErrorEvent,
  JobStuckEvent,
} from '../event.types';

@Injectable()
export class JobHandler {
  private readonly logger = new Logger(JobHandler.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  @RabbitSubscribe({
    exchange: SMITHY_EVENTS_EXCHANGE,
    routingKey: 'job.#',
    queue: 'smithy.job.state-updates',
    queueOptions: {
      deadLetterExchange: SMITHY_EVENTS_DLX,
      durable: true,
    },
  })
  async handleJobEvent(
    envelope: EventEnvelope<Record<string, unknown>>,
  ): Promise<void | Nack> {
    const { eventType, correlationId } = envelope;
    this.logger.debug(
      `Received event: ${eventType} correlationId=${correlationId}`,
    );

    try {
      switch (eventType) {
        case 'job.state.changed':
          await this.onJobStateChanged(
            envelope as unknown as WorkerStateChangedEvent,
          );
          break;
        case 'job.error':
          await this.onJobError(envelope as unknown as JobErrorEvent);
          break;
        case 'job.stuck':
          await this.onJobStuck(envelope as unknown as JobStuckEvent);
          break;
        default:
          this.logger.debug(
            `Unhandled job event type: ${eventType} correlationId=${correlationId}`,
          );
      }
    } catch (err: unknown) {
      this.logger.error(
        `Failed to handle event: ${eventType} correlationId=${correlationId}`,
        err instanceof Error ? err.stack : String(err),
      );
      return new Nack(false);
    }
  }

  private async onJobStateChanged(
    event: WorkerStateChangedEvent,
  ): Promise<void> {
    this.eventEmitter.emit('job.state.update-db', {
      jobExecutionId: event.payload.jobExecutionId,
      previousState: event.payload.previousState,
      newState: event.payload.newState,
      correlationId: event.correlationId,
    });

    this.eventEmitter.emit('socketio.broadcast', {
      room: `job:${event.payload.jobExecutionId}`,
      event: 'job.state.changed',
      data: {
        jobExecutionId: event.payload.jobExecutionId,
        previousState: event.payload.previousState,
        newState: event.payload.newState,
      },
      correlationId: event.correlationId,
    });
  }

  private async onJobError(event: JobErrorEvent): Promise<void> {
    this.eventEmitter.emit('notification.email', {
      type: 'job.error',
      subject: `Job Error: ${event.payload.error.message}`,
      body: {
        jobExecutionId: event.payload.jobExecutionId,
        workerVersionId: event.payload.workerVersionId,
        error: event.payload.error,
        retryCount: event.payload.retryCount,
        willRetry: event.payload.willRetry,
        dashboardLink: `/jobs/${event.payload.jobExecutionId}`,
      },
      correlationId: event.correlationId,
    });
  }

  private async onJobStuck(event: JobStuckEvent): Promise<void> {
    this.eventEmitter.emit('notification.in-app', {
      type: 'job.stuck',
      title: 'Job Stuck — Action Required',
      message: `Job ${event.payload.jobExecutionId} is stuck: ${event.payload.reason}`,
      correlationId: event.correlationId,
      metadata: {
        jobExecutionId: event.payload.jobExecutionId,
        reason: event.payload.reason,
        stuckSince: event.payload.stuckSince,
      },
    });

    this.eventEmitter.emit('socketio.broadcast', {
      room: `job:${event.payload.jobExecutionId}`,
      event: 'job.stuck',
      data: {
        jobExecutionId: event.payload.jobExecutionId,
        reason: event.payload.reason,
        stuckSince: event.payload.stuckSince,
      },
      correlationId: event.correlationId,
    });
  }
}
