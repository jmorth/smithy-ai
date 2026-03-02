import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { randomUUID } from 'node:crypto';
import type { EventTypeMap, EventEnvelope, RoutingKey } from './event.types';
import { SMITHY_EVENTS_EXCHANGE } from './events.module';

type EventPayload<K extends RoutingKey> = K extends keyof EventTypeMap
  ? EventTypeMap[K]['payload']
  : unknown;

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(private readonly amqp: AmqpConnection) {}

  async publish<K extends RoutingKey>(
    routingKey: K,
    payload: EventPayload<K>,
    correlationId?: string,
  ): Promise<void> {
    const envelope: EventEnvelope<EventPayload<K>> = {
      eventType: routingKey,
      timestamp: new Date().toISOString(),
      correlationId: correlationId ?? randomUUID(),
      payload,
    };

    try {
      await this.amqp.publish(SMITHY_EVENTS_EXCHANGE, routingKey, envelope, {
        persistent: true,
      });
      this.logger.debug(
        `Published event: ${routingKey} correlationId=${envelope.correlationId}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to publish event: ${routingKey} correlationId=${envelope.correlationId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
