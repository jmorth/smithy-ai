import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SMITHY_EVENTS_EXCHANGE,
  SMITHY_EVENTS_DLX,
} from '../events.module';
import type {
  EventEnvelope,
  PackageCreatedEvent,
  PackageProcessedEvent,
} from '../event.types';

@Injectable()
export class PackageHandler {
  private readonly logger = new Logger(PackageHandler.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  @RabbitSubscribe({
    exchange: SMITHY_EVENTS_EXCHANGE,
    routingKey: 'package.*',
    queue: 'smithy.package.notifications',
    queueOptions: {
      deadLetterExchange: SMITHY_EVENTS_DLX,
      durable: true,
    },
  })
  async handlePackageEvent(
    envelope: EventEnvelope<Record<string, unknown>>,
  ): Promise<void | Nack> {
    const { eventType, correlationId } = envelope;
    this.logger.debug(
      `Received event: ${eventType} correlationId=${correlationId}`,
    );

    try {
      switch (eventType) {
        case 'package.created':
          await this.onPackageCreated(
            envelope as unknown as PackageCreatedEvent,
          );
          break;
        case 'package.processed':
          await this.onPackageProcessed(
            envelope as unknown as PackageProcessedEvent,
          );
          break;
        default:
          this.logger.debug(
            `Unhandled package event type: ${eventType} correlationId=${correlationId}`,
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

  private async onPackageCreated(event: PackageCreatedEvent): Promise<void> {
    this.eventEmitter.emit('notification.in-app', {
      type: 'package.created',
      recipientId: event.payload.createdBy,
      title: 'Package Created',
      message: `Package ${event.payload.packageId} has been created.`,
      correlationId: event.correlationId,
      metadata: { packageId: event.payload.packageId },
    });
  }

  private async onPackageProcessed(
    event: PackageProcessedEvent,
  ): Promise<void> {
    this.eventEmitter.emit('notification.in-app', {
      type: 'package.processed',
      recipientId: event.payload.processedBy,
      title: 'Package Processed',
      message: `Package ${event.payload.packageId} has been processed. Result: ${event.payload.resultSummary}`,
      correlationId: event.correlationId,
      metadata: {
        packageId: event.payload.packageId,
        resultSummary: event.payload.resultSummary,
      },
    });
  }
}
