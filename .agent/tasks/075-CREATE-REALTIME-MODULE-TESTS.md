# Task 075: Create Realtime Module Tests

## Summary
Write integration tests for the Socket.IO event flow — verify that domain events reach the correct rooms and that the interactive question/answer cycle works end-to-end. Tests use `socket.io-client` to connect to the gateways and assert on received events.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 074 (Realtime Bridge Service — the full pipeline being tested)
- **Blocks**: None

## Architecture Reference
Tests spin up a NestJS testing module with the `RealtimeModule` and mock dependencies (RabbitMQ, database). A `socket.io-client` instance connects to the test server's WebSocket endpoint. Tests exercise the full path: publish a domain event (or directly call the bridge service) → verify the Socket.IO client receives the expected event in the correct room. Interactive tests verify the bidirectional flow: emit a question → client receives it → client sends answer → verify storage.

## Files and Folders
- `/apps/api/src/modules/realtime/__tests__/realtime.gateway.spec.ts` — Tests for workflow subscription and broadcast behavior
- `/apps/api/src/modules/realtime/__tests__/interactive.gateway.spec.ts` — Tests for interactive question/answer flow

## Acceptance Criteria
- [ ] **Workflow gateway tests**: client subscribes to assembly line room → receives `package:status` events broadcast to that room; client subscribes to worker pool room → receives `job:state` events; client in different room does NOT receive events from other rooms; unsubscribe removes client from room; `assembly-line:completed` event is received by subscribed clients
- [ ] **Interactive gateway tests**: client subscribes to job room → receives `interactive:question` event when Worker enters STUCK state; client sends `interactive:answer` → answer is stored (mocked DB/Redis); client receives `interactive:answered` confirmation; duplicate answer for same question is rejected; answer for non-STUCK job is rejected
- [ ] **Bridge service tests**: domain event published → correct Socket.IO event emitted to correct room; event payload is correctly transformed to client format; correlation ID is included in emitted payload
- [ ] Tests use `socket.io-client` to connect to the NestJS test server
- [ ] All tests properly disconnect clients and clean up in afterEach/afterAll
- [ ] All tests pass with `pnpm --filter api test`

## Implementation Notes
- Set up the test server with a random port to avoid conflicts:
  ```typescript
  const app = await NestFactory.create(TestModule);
  await app.listen(0); // random port
  const port = app.getHttpServer().address().port;
  const client = io(`http://localhost:${port}/workflows`);
  ```
- Socket.IO client events are asynchronous. Use promise wrappers for clean test assertions:
  ```typescript
  const waitForEvent = (client, event) => new Promise((resolve) => client.once(event, resolve));
  ```
- Always disconnect clients in `afterEach` to prevent test leaks:
  ```typescript
  afterEach(() => { client.disconnect(); });
  afterAll(async () => { await app.close(); });
  ```
- For the bridge service tests, directly invoke the bridge's RabbitMQ handler methods instead of publishing through actual RabbitMQ — this tests the bridge logic without requiring a message broker.
- Mock the database/Redis for answer storage in interactive tests. Verify that the correct storage method is called with the expected arguments.
- Test room isolation carefully — this is a common source of bugs where events leak to unintended rooms.
