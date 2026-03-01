# Task 069: Create Domain Event Handlers

## Summary
Create RabbitMQ consumer handlers for domain events: `package.*`, `job.state.changed`, `assembly-line.completed`, and `job.error`. Each handler subscribes to specific routing key patterns and routes events to the appropriate downstream services — notifications (email, in-app), Socket.IO broadcast, and database updates.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 068 (Event Bus Service — events are published to the exchange these handlers consume from)
- **Blocks**: 070 (Event Bus Tests — tests handler behavior), 074 (Realtime Bridge Service — may duplicate or complement these handlers)

## Architecture Reference
Event handlers are NestJS injectable services decorated with `@RabbitSubscribe` from `@golevelup/nestjs-rabbitmq`. Each handler binds a queue to the `smithy.events` exchange with a routing key pattern. When a matching event arrives, the handler method is invoked with the event envelope. Handlers are thin routing layers — they extract relevant data from the event and delegate to downstream services (notification channels, Socket.IO gateway, database). Failed handler executions route the message to the dead-letter exchange for later inspection.

## Files and Folders
- `/apps/api/src/modules/events/event-handlers/package.handler.ts` — Handles `package.*` events (created, updated, processed)
- `/apps/api/src/modules/events/event-handlers/job.handler.ts` — Handles `job.state.changed`, `job.error`, `job.stuck` events
- `/apps/api/src/modules/events/event-handlers/assembly-line.handler.ts` — Handles `assembly-line.completed`, `assembly-line.step.completed` events

## Acceptance Criteria
- [ ] **PackageHandler**: subscribes to `package.*` routing key pattern; on `package.created` — creates in-app notification for the Package owner; on `package.processed` — creates in-app notification with result summary
- [ ] **JobHandler**: subscribes to `job.#` routing key pattern; on `job.state.changed` — updates `job_executions` table with new state, forwards event to Socket.IO via event emission; on `job.error` — sends email notification to Assembly Line owner with error details; on `job.stuck` — sends in-app notification + Socket.IO event for interactive question prompt
- [ ] **AssemblyLineHandler**: subscribes to `assembly-line.*` routing key pattern; on `assembly-line.completed` — sends completion email + triggers outgoing webhook; on `assembly-line.step.completed` — creates in-app notification with step summary
- [ ] Each handler uses `@RabbitSubscribe` decorator with explicit queue names (e.g., `smithy.package.notifications`, `smithy.job.state-updates`)
- [ ] Queues are configured with dead-letter exchange binding (`smithy.events.dlx`)
- [ ] Correlation ID from the event envelope is propagated to all downstream calls
- [ ] Handlers log received events at debug level with routing key and correlation ID
- [ ] Failed handler executions do not crash the process — errors are caught, logged, and the message is nacked to the DLX

## Implementation Notes
- The `@RabbitSubscribe` decorator configuration:
  ```typescript
  @RabbitSubscribe({
    exchange: 'smithy.events',
    routingKey: 'job.#',
    queue: 'smithy.job.state-updates',
    queueOptions: {
      deadLetterExchange: 'smithy.events.dlx',
      durable: true,
    },
  })
  ```
- Each handler should be a separate class/service for single-responsibility. They can be registered as providers in the `EventsModule`.
- Downstream service calls (notifications, Socket.IO) may not be available yet when this task is implemented. Use NestJS `EventEmitter2` as a local bridge — emit local events that the notification/realtime modules will subscribe to when they're built.
- For the email notification on `job.error`, include: Worker name, error message, last 10 log lines, and a link to the job in the dashboard.
- The `assembly-line.completed` handler should include timing information (total duration) in the email and webhook payload.
- Be mindful of handler concurrency — the `prefetchCount` from task 067 controls how many messages each handler processes concurrently. Default of 10 is reasonable.
