# Task 068: Create Event Bus Service

## Summary
Create `EventBusService` with a type-safe `publish(routingKey, event)` method that wraps event payloads in a standard envelope (eventType, timestamp, correlationId, payload) and publishes to the `smithy.events` topic exchange. Also defines the exchange topology including the dead-letter exchange for failed messages.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 067 (RabbitMQ Events Module — provides AMQP connection), 021 (Event Types — defines the domain event type system)
- **Blocks**: 069 (Domain Event Handlers — consume events from the bus), 044 (Assembly Line Orchestrator — publishes events via the bus)

## Architecture Reference
The `EventBusService` is the single publishing interface for all domain events in the Smithy API. Instead of services publishing directly to RabbitMQ, they call `eventBus.publish('job.state.changed', payload)`. The service wraps every payload in a standard event envelope that includes metadata (type, timestamp, correlation ID) for traceability and debugging. The topic exchange enables flexible routing: consumers can subscribe to `job.*` (all job events), `package.created` (specific event), or `#` (all events).

## Files and Folders
- `/apps/api/src/modules/events/event-bus.service.ts` — Publishing service with envelope wrapping and type safety
- `/apps/api/src/modules/events/event.types.ts` — Event envelope type, routing key constants, and event payload types

## Acceptance Criteria
- [ ] `publish(routingKey: string, event: DomainEvent)` wraps the payload in an event envelope: `{ eventType: string, timestamp: string, correlationId: string, payload: T }`
- [ ] Publishes to the `smithy.events` topic exchange with the given routing key
- [ ] Routing keys follow dot-separated convention: `{domain}.{action}` (e.g., `job.state.changed`, `package.created`, `assembly-line.completed`)
- [ ] `correlationId` is generated as a UUID v4 if not provided, or propagated from the incoming request context
- [ ] `timestamp` is ISO 8601 format
- [ ] Type-safe: event payloads are typed per routing key (e.g., `publish('job.state.changed', { jobId, fromState, toState })`)
- [ ] Event envelope type and all event payload types are defined in `event.types.ts`
- [ ] Routing key constants are exported for type-safe usage: `EventRoutes.JOB_STATE_CHANGED`, `EventRoutes.PACKAGE_CREATED`, etc.
- [ ] Failed publishes are logged as errors but do not throw (fire-and-forget semantics for event publishing)
- [ ] The service is injectable via NestJS DI (`@Injectable()`)

## Implementation Notes
- Use `AmqpConnection.publish()` from `@golevelup/nestjs-rabbitmq` for publishing. The connection is injected via the `EventsModule`.
- The event envelope pattern ensures every consumer gets consistent metadata without each publisher manually adding it:
  ```typescript
  interface EventEnvelope<T = unknown> {
    eventType: string;
    timestamp: string;
    correlationId: string;
    payload: T;
  }
  ```
- For correlation ID propagation, consider using `AsyncLocalStorage` (Node.js built-in) to carry the request's correlation ID through the call stack. If no correlation ID exists (e.g., background job), generate a new one.
- Define event payload types explicitly rather than using `unknown`:
  ```typescript
  interface JobStateChangedEvent { jobId: string; fromState: JobState; toState: JobState; }
  interface PackageCreatedEvent { packageId: string; type: PackageType; assemblyLineId?: string; }
  ```
- Message persistence: set `persistent: true` on published messages so they survive RabbitMQ restarts.
- Consider adding a `publishBatch(events[])` method for cases where multiple events need to be published atomically (e.g., assembly line step completion).
