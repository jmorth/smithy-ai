import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SMITHY_EVENTS_EXCHANGE,
  SMITHY_EVENTS_DLX,
} from '../events.module';
import type {
  EventEnvelope,
  AssemblyLineCompletedEvent,
  AssemblyLineStepCompletedEvent,
} from '../event.types';

@Injectable()
export class AssemblyLineHandler {
  private readonly logger = new Logger(AssemblyLineHandler.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  @RabbitSubscribe({
    exchange: SMITHY_EVENTS_EXCHANGE,
    routingKey: 'assembly-line.*',
    queue: 'smithy.assembly-line.notifications',
    queueOptions: {
      deadLetterExchange: SMITHY_EVENTS_DLX,
      durable: true,
    },
  })
  async handleAssemblyLineEvent(
    envelope: EventEnvelope<Record<string, unknown>>,
  ): Promise<void | Nack> {
    const { eventType, correlationId } = envelope;
    this.logger.debug(
      `Received event: ${eventType} correlationId=${correlationId}`,
    );

    try {
      switch (eventType) {
        case 'assembly-line.completed':
          await this.onAssemblyLineCompleted(
            envelope as unknown as AssemblyLineCompletedEvent,
          );
          break;
        case 'assembly-line.step.completed':
          await this.onStepCompleted(
            envelope as unknown as AssemblyLineStepCompletedEvent,
          );
          break;
        default:
          this.logger.debug(
            `Unhandled assembly-line event type: ${eventType} correlationId=${correlationId}`,
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

  private async onAssemblyLineCompleted(
    event: AssemblyLineCompletedEvent,
  ): Promise<void> {
    const durationSeconds = (event.payload.totalDuration / 1000).toFixed(1);

    this.eventEmitter.emit('notification.email', {
      type: 'assembly-line.completed',
      subject: `Assembly Line Completed: ${event.payload.assemblyLineId}`,
      body: {
        assemblyLineId: event.payload.assemblyLineId,
        packageId: event.payload.packageId,
        totalSteps: event.payload.totalSteps,
        totalDuration: event.payload.totalDuration,
        durationFormatted: `${durationSeconds}s`,
      },
      correlationId: event.correlationId,
    });

    this.eventEmitter.emit('webhook.outgoing', {
      type: 'assembly-line.completed',
      payload: {
        assemblyLineId: event.payload.assemblyLineId,
        packageId: event.payload.packageId,
        totalSteps: event.payload.totalSteps,
        totalDuration: event.payload.totalDuration,
        durationFormatted: `${durationSeconds}s`,
      },
      correlationId: event.correlationId,
    });
  }

  private async onStepCompleted(
    event: AssemblyLineStepCompletedEvent,
  ): Promise<void> {
    this.eventEmitter.emit('notification.in-app', {
      type: 'assembly-line.step.completed',
      title: 'Assembly Line Step Completed',
      message: `Step ${event.payload.stepIndex + 1} (${event.payload.stepName}) completed for assembly line ${event.payload.assemblyLineId}.`,
      correlationId: event.correlationId,
      metadata: {
        assemblyLineId: event.payload.assemblyLineId,
        stepIndex: event.payload.stepIndex,
        stepName: event.payload.stepName,
        duration: event.payload.duration,
      },
    });
  }
}
