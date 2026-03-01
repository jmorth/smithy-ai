# Task 067: Create RabbitMQ Events Module

## Summary
Create the RabbitMQ `EventsModule` with connection configuration using `@golevelup/nestjs-rabbitmq`, wired into the NestJS application. This module provides the foundational message broker connectivity that all event publishing and consuming depends on — domain events, notifications, and real-time updates all flow through RabbitMQ.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 022 (Bootstrap NestJS Application — module is imported by AppModule), 023 (Zod Configuration Module — provides `RABBITMQ_URL` config)
- **Blocks**: 068 (Event Bus Service), 069 (Domain Event Handlers), 070 (Event Bus Tests)

## Architecture Reference
RabbitMQ serves as the central event bus for the Smithy platform. The `@golevelup/nestjs-rabbitmq` library provides NestJS-native integration with decorators for publishing and subscribing. The module configures the AMQP connection, declares exchanges, and handles lifecycle events (connection, disconnection, reconnection). All domain events flow through a topic exchange (`smithy.events`), enabling flexible routing key patterns for consumers. The module lives at `apps/api/src/modules/events/`.

## Files and Folders
- `/apps/api/src/modules/events/events.module.ts` — NestJS module configuring RabbitMQ connection and exchange topology

## Acceptance Criteria
- [ ] Installs `@golevelup/nestjs-rabbitmq` and `amqplib` as dependencies
- [ ] Configures RabbitMQ connection using `RABBITMQ_URL` from `ConfigModule` (e.g., `amqp://localhost:5672`)
- [ ] Uses `RabbitMQModule.forRootAsync()` for async configuration from the config service
- [ ] Declares exchanges on module initialization (exchange declarations belong here, not in individual services)
- [ ] Module is importable by `AppModule` and other feature modules
- [ ] Handles connection errors gracefully — logs error, does not crash the application
- [ ] Automatically reconnects on connection loss with configurable retry interval
- [ ] Module exports `AmqpConnection` for direct access by services that need to publish
- [ ] Connection status is observable (for health checks in task 027)

## Implementation Notes
- The `@golevelup/nestjs-rabbitmq` library handles most of the complexity. Configuration pattern:
  ```typescript
  RabbitMQModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      uri: config.get('RABBITMQ_URL'),
      exchanges: [
        { name: 'smithy.events', type: 'topic' },
        { name: 'smithy.events.dlx', type: 'fanout' },
      ],
      connectionInitOptions: { wait: true, timeout: 10000 },
      channels: { default: { prefetchCount: 10 } },
    }),
  })
  ```
- The `wait: true` option ensures the module waits for the connection before declaring the app ready. Set a reasonable timeout (10s) to avoid hanging on startup if RabbitMQ is down.
- Exchange topology: `smithy.events` is the main topic exchange for domain events. `smithy.events.dlx` is a dead-letter exchange for failed message processing. Queues will bind to these exchanges in handler tasks (069).
- For local development, RabbitMQ runs in the Docker Compose dev stack (task 011). The default URL is `amqp://guest:guest@localhost:5672`.
- Consider adding a `enableControllerDiscovery: true` option so the library auto-discovers `@RabbitSubscribe` decorators in providers.
