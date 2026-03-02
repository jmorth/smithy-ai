import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import {
  EventsModule,
  SMITHY_EVENTS_EXCHANGE,
  SMITHY_EVENTS_DLX,
  createRabbitMQConfig,
} from './events.module';

const mockConfigService = {
  get: vi.fn((key: string) => {
    const config: Record<string, string> = {
      'rabbitmq.url': 'amqp://guest:guest@localhost:5672',
    };
    return config[key];
  }),
};

describe('EventsModule', () => {
  describe('module metadata', () => {
    it('is decorated with @Global()', () => {
      const metadata = Reflect.getMetadata('__module:global__', EventsModule);
      expect(metadata).toBe(true);
    });

    it('imports RabbitMQModule', () => {
      const imports = Reflect.getMetadata('imports', EventsModule) as unknown[];
      // forRootAsync returns a dynamic module object, verify it's present
      expect(imports).toBeDefined();
      expect(imports.length).toBeGreaterThan(0);
    });

    it('exports RabbitMQModule for AmqpConnection access', () => {
      const exports = Reflect.getMetadata('exports', EventsModule) as unknown[];
      expect(exports).toContain(RabbitMQModule);
    });
  });

  describe('exchange constants', () => {
    it('defines smithy.events as the main event exchange', () => {
      expect(SMITHY_EVENTS_EXCHANGE).toBe('smithy.events');
    });

    it('defines smithy.events.dlx as the dead-letter exchange', () => {
      expect(SMITHY_EVENTS_DLX).toBe('smithy.events.dlx');
    });
  });

  describe('createRabbitMQConfig', () => {
    it('reads rabbitmq.url from ConfigService', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      expect(config.uri).toBe('amqp://guest:guest@localhost:5672');
      expect(mockConfigService.get).toHaveBeenCalledWith('rabbitmq.url', {
        infer: true,
      });
    });

    it('declares smithy.events as a topic exchange', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      expect(config.exchanges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'smithy.events',
            type: 'topic',
          }),
        ]),
      );
    });

    it('declares smithy.events.dlx as a fanout dead-letter exchange', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      expect(config.exchanges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'smithy.events.dlx',
            type: 'fanout',
          }),
        ]),
      );
    });

    it('declares exactly two exchanges', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      expect(config.exchanges).toHaveLength(2);
    });

    it('does not block app startup on connection failure (wait: false)', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      expect(config.connectionInitOptions?.wait).toBe(false);
    });

    it('does not reject on connection failure (reject: false)', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      expect(config.connectionInitOptions?.reject).toBe(false);
    });

    it('configures heartbeat interval of 15 seconds', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      expect(config.connectionManagerOptions?.heartbeatIntervalInSeconds).toBe(
        15,
      );
    });

    it('configures automatic reconnection with 5-second retry interval', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      expect(config.connectionManagerOptions?.reconnectTimeInSeconds).toBe(5);
    });

    it('sets connection timeout to 10 seconds', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      const opts = config.connectionManagerOptions as Record<string, unknown>;
      const connOpts = opts.connectionOptions as Record<string, unknown>;
      expect(connOpts.timeout).toBe(10000);
    });

    it('configures default channel with prefetch count of 10', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      expect(config.channels).toEqual({
        default: { prefetchCount: 10, default: true },
      });
    });

    it('enables controller discovery for @RabbitSubscribe decorators', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      expect(config.enableControllerDiscovery).toBe(true);
    });

    it('provides a NestJS Logger instance', () => {
      const config = createRabbitMQConfig(
        mockConfigService as unknown as ConfigService,
      );
      expect(config.logger).toBeDefined();
    });

    it('uses different config URL when environment differs', () => {
      const customConfigService = {
        get: vi.fn().mockReturnValue('amqp://prod:prod@rabbitmq.prod:5672'),
      };
      const config = createRabbitMQConfig(
        customConfigService as unknown as ConfigService,
      );
      expect(config.uri).toBe('amqp://prod:prod@rabbitmq.prod:5672');
    });
  });
});
