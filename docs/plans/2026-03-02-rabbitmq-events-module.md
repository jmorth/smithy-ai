# RabbitMQ Events Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the RabbitMQ EventsModule providing broker connectivity for all domain event publishing and consuming.

**Architecture:** Use `@golevelup/nestjs-rabbitmq` which wraps `amqp-connection-manager` for automatic reconnection. The module uses `forRootAsync` to pull config from NestJS ConfigService, declares topic and dead-letter exchanges, and exports `AmqpConnection` for publishing. Marked `@Global()` so any module can inject the connection.

**Tech Stack:** @golevelup/nestjs-rabbitmq, amqplib, NestJS, Vitest

---

### Task 1: Install dependency

```bash
cd apps/api && pnpm add @golevelup/nestjs-rabbitmq
```

### Task 2: Create EventsModule

**Files:**
- Create: `apps/api/src/modules/events/events.module.ts`
- Remove: `apps/api/src/modules/events/.gitkeep`

Uses `RabbitMQModule.forRootAsync()` with:
- URI from `ConfigService.get('rabbitmq.url')`
- Two exchanges: `smithy.events` (topic), `smithy.events.dlx` (fanout)
- `connectionInitOptions: { wait: false }` so app boots even if RabbitMQ is down
- `connectionManagerOptions: { heartbeatIntervalInSeconds: 15, reconnectTimeInSeconds: 5 }`
- `channels: { default: { prefetchCount: 10, default: true } }`
- `enableControllerDiscovery: true`
- Module is `@Global()` and exports `AmqpConnection`

### Task 3: Import EventsModule in AppModule

**Files:**
- Modify: `apps/api/src/app.module.ts`

Add `EventsModule` to imports after `DatabaseModule`.

### Task 4: Write tests for EventsModule

**Files:**
- Create: `apps/api/src/modules/events/events.module.spec.ts`

Test coverage:
- Module is defined and compiles
- Module is decorated with `@Global()`
- RabbitMQModule.forRootAsync is called with correct config
- Exchanges are declared (smithy.events topic, smithy.events.dlx fanout)
- AmqpConnection is exported and injectable
- Connection errors don't crash the application
- Reconnection is configured

### Task 5: Run all checks

```bash
pnpm run lint && pnpm run typecheck && pnpm run test
```

### Task 6: Commit and merge
