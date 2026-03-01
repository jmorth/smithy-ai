# Task 074: Create Realtime Bridge Service

## Summary
Create `RealtimeService` that bridges RabbitMQ domain events to Socket.IO room broadcasts. This service subscribes to the event bus and transforms domain events into client-friendly WebSocket emissions, routing each event to the correct gateway and room. It is the glue between the async event bus and the real-time WebSocket layer.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 072 (Workflow Realtime Gateway — emits workflow events), 073 (Interactive Worker Gateway — emits interactive events), 068 (Event Bus Service — source of domain events)
- **Blocks**: 075 (Realtime Module Tests — tests the bridge behavior)

## Architecture Reference
The `RealtimeService` acts as a translator between the RabbitMQ event bus (server-side, async, durable) and Socket.IO (client-facing, real-time, ephemeral). It subscribes to RabbitMQ events via `@RabbitSubscribe` decorators and calls the appropriate gateway methods to emit WebSocket events. The service transforms event payloads from the internal domain format to client-friendly formats (stripping internal IDs, adding display names, formatting timestamps). This separation keeps gateways clean (they only know about Socket.IO) and keeps event handlers clean (they only know about domain logic).

## Files and Folders
- `/apps/api/src/modules/realtime/realtime.service.ts` — Bridge service subscribing to RabbitMQ events and emitting via Socket.IO gateways

## Acceptance Criteria
- [ ] Subscribes to `job.state.changed` events → emits to `job:{jobId}` room (via workflow gateway) AND `assembly-line:{slug}` room with `job:state` event
- [ ] Subscribes to `package.created` events → emits to `assembly-line:{slug}` room with `package:status` event
- [ ] Subscribes to `assembly-line.completed` events → emits to `assembly-line:{slug}` room with `assembly-line:completed` event
- [ ] Subscribes to `assembly-line.step.completed` events → emits to `assembly-line:{slug}` room with `assembly-line:progress` event
- [ ] Subscribes to `job.stuck` events → emits to `job:{jobId}` room (via interactive gateway) with `interactive:question` event
- [ ] Transforms event payloads into client-friendly format: camelCase keys, human-readable state names, ISO timestamps, display names instead of internal IDs where possible
- [ ] Failed emissions are logged but do not affect event processing (fire-and-forget)
- [ ] Correlation ID from the event envelope is included in emitted WebSocket payloads for debugging

## Implementation Notes
- The service needs references to both gateways. Inject them via NestJS DI:
  ```typescript
  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    private readonly interactiveGateway: InteractiveGateway,
  ) {}
  ```
- For payload transformation, create a set of mapper functions:
  ```typescript
  private mapJobStateEvent(event: JobStateChangedEvent): ClientJobStatePayload {
    return {
      jobId: event.jobId,
      state: event.toState,
      previousState: event.fromState,
      updatedAt: event.timestamp,
      workerName: event.workerName, // resolved from cache or event
    };
  }
  ```
- The bridge may need to look up additional data not present in the event payload (e.g., Assembly Line slug from a job ID). Options: (a) include all needed data in the event payload at publish time, (b) look up in the database. Prefer (a) to avoid DB queries in the hot path.
- Consider debouncing high-frequency events (e.g., log entries) to avoid overwhelming WebSocket clients. A 100ms debounce window with batch emission is a good starting point.
- This service should be registered in the `RealtimeModule` and the module should import the `EventsModule` to get RabbitMQ connectivity.
