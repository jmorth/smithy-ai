import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RabbitMQModule,
  RabbitMQConfig,
} from '@golevelup/nestjs-rabbitmq';
import type { AppConfig } from '../../config/configuration';
import { EventBusService } from './event-bus.service';

export { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

export const SMITHY_EVENTS_EXCHANGE = 'smithy.events';
export const SMITHY_EVENTS_DLX = 'smithy.events.dlx';

export function createRabbitMQConfig(
  config: ConfigService<AppConfig, true>,
): RabbitMQConfig {
  return {
    uri: config.get('rabbitmq.url', { infer: true }),
    exchanges: [
      { name: SMITHY_EVENTS_EXCHANGE, type: 'topic' },
      { name: SMITHY_EVENTS_DLX, type: 'fanout' },
    ],
    connectionInitOptions: {
      wait: false,
      reject: false,
    },
    connectionManagerOptions: {
      heartbeatIntervalInSeconds: 15,
      reconnectTimeInSeconds: 5,
      connectionOptions: {
        timeout: 10000,
      },
    },
    channels: {
      default: { prefetchCount: 10, default: true },
    },
    enableControllerDiscovery: true,
    logger: new Logger('EventsModule'),
  };
}

@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createRabbitMQConfig,
    }),
  ],
  providers: [EventBusService],
  exports: [RabbitMQModule, EventBusService],
})
export class EventsModule {}
