# Task 072: Create Workflow Realtime Gateway

## Summary
Create `RealtimeGateway` handling workflow subscription events — clients join Socket.IO rooms for specific Assembly Lines or Worker Pools and receive broadcast status updates including package progress, job state changes, and assembly line completion. This gateway serves the main dashboard real-time experience.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 071 (Socket.IO Realtime Module — provides the WebSocket infrastructure)
- **Blocks**: 074 (Realtime Bridge Service — emits events through this gateway)

## Architecture Reference
The `RealtimeGateway` operates on the `/workflows` Socket.IO namespace. Clients (frontend) connect and subscribe to specific Assembly Line or Worker Pool rooms by emitting `subscribe:assembly-line` or `subscribe:worker-pool` events with the resource slug. The gateway adds the client to the corresponding room. When domain events occur (via the bridge service, task 074), they are broadcast to the room so all subscribed clients receive updates. Room naming follows a consistent pattern: `assembly-line:{slug}` and `worker-pool:{slug}`.

## Files and Folders
- `/apps/api/src/modules/realtime/realtime.gateway.ts` — WebSocket gateway for workflow subscriptions and broadcasts

## Acceptance Criteria
- [ ] `@WebSocketGateway({ namespace: '/workflows' })` decorator with CORS configuration
- [ ] Handles `subscribe:assembly-line` event — client joins room `assembly-line:{slug}`
- [ ] Handles `subscribe:worker-pool` event — client joins room `worker-pool:{slug}`
- [ ] Handles `unsubscribe:assembly-line` event — client leaves room `assembly-line:{slug}`
- [ ] Handles `unsubscribe:worker-pool` event — client leaves room `worker-pool:{slug}`
- [ ] Broadcasts `package:status` event to assembly line rooms when a Package changes state
- [ ] Broadcasts `job:state` event to assembly line and worker pool rooms when a job state changes
- [ ] Broadcasts `assembly-line:progress` event to assembly line rooms with step completion progress
- [ ] Broadcasts `assembly-line:completed` event when an Assembly Line finishes all steps
- [ ] Client connection/disconnection automatically cleans up room memberships
- [ ] Validates subscription slugs (non-empty string, alphanumeric + hyphens)

## Implementation Notes
- NestJS WebSocket gateway pattern:
  ```typescript
  @WebSocketGateway({ namespace: '/workflows', cors: { origin: process.env.CORS_ORIGIN } })
  export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnection {
    @WebSocketServer() server: Server;

    @SubscribeMessage('subscribe:assembly-line')
    handleSubscribeAssemblyLine(client: Socket, slug: string) {
      client.join(`assembly-line:${slug}`);
    }
  }
  ```
- The gateway provides `emitToRoom(room, event, data)` and `emitToAll(event, data)` methods that the bridge service (task 074) calls.
- Track client subscriptions in a `Map<clientId, Set<roomName>>` for debugging and monitoring — this is separate from Socket.IO's built-in room tracking and useful for admin visibility.
- Validate that the Assembly Line or Worker Pool slug exists before joining the room. Return an error event if the resource does not exist.
- Consider rate-limiting subscription events to prevent abuse (e.g., max 50 rooms per client).
- The `OnGatewayDisconnection` handler should log the disconnected client's rooms for debugging connection issues.
