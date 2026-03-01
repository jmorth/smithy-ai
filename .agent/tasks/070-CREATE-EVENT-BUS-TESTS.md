# Task 070: Create Event Bus Tests

## Summary
Write unit tests for `EventBusService` verifying event envelope formatting and publishing, plus unit tests for each domain event handler verifying correct downstream service invocations. Integration tests verify end-to-end event flow from publish to handler execution.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 068 (Event Bus Service), 069 (Domain Event Handlers)
- **Blocks**: None

## Architecture Reference
Tests live in the `events` module's `__tests__` directory. Unit tests mock the `AmqpConnection` for the bus service and mock downstream services (notifications, database, Socket.IO) for handlers. Integration tests use a real or emulated RabbitMQ connection to verify the full publish-subscribe cycle. Tests use NestJS `Test.createTestingModule` for DI setup.

## Files and Folders
- `/apps/api/src/modules/events/__tests__/event-bus.service.spec.ts` — Unit tests for EventBusService
- `/apps/api/src/modules/events/__tests__/event-handlers.spec.ts` — Unit tests for all domain event handlers

## Acceptance Criteria
- [ ] **EventBusService tests**: `publish()` wraps payload in event envelope with eventType, timestamp, correlationId; `publish()` calls `AmqpConnection.publish` with correct exchange name and routing key; timestamp is valid ISO 8601; correlationId is UUID v4 format when auto-generated; provided correlationId is propagated; failed publish is logged but does not throw
- [ ] **PackageHandler tests**: `package.created` event triggers in-app notification creation; `package.processed` event triggers notification with result summary; unknown package events are logged and ignored
- [ ] **JobHandler tests**: `job.state.changed` event updates job_executions record; `job.error` event triggers email notification; `job.stuck` event triggers in-app notification + Socket.IO emission; correlation ID is passed to downstream services
- [ ] **AssemblyLineHandler tests**: `assembly-line.completed` triggers email + webhook delivery; `assembly-line.step.completed` creates in-app notification; event payload data is correctly extracted and passed to downstream services
- [ ] **Integration tests**: publish an event via EventBusService → verify the corresponding handler is invoked with the correct event envelope (requires RabbitMQ or mock)
- [ ] All tests pass with `pnpm --filter api test`

## Implementation Notes
- For unit tests, mock `AmqpConnection` to capture published messages:
  ```typescript
  const mockAmqpConnection = { publish: vi.fn() };
  ```
- For handler tests, mock all downstream services (NotificationsService, RealtimeService, database repository) and verify they are called with expected arguments.
- For integration tests, options: (a) use `@golevelup/nestjs-rabbitmq` test utilities, (b) use a RabbitMQ Docker container via testcontainers, (c) mock at the AMQP level. Option (a) or (c) is preferred for CI speed.
- Test that the dead-letter exchange receives messages when handlers throw errors.
- Verify that the event envelope timestamp is recent (within 1 second of `new Date().toISOString()`) rather than checking exact equality.
- Test edge cases: empty payload, very large payload, special characters in routing keys.
