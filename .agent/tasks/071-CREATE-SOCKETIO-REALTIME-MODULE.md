# Task 071: Create Socket.IO Realtime Module

## Summary
Create the Socket.IO `RealtimeModule` with Redis adapter for horizontal scaling across multiple API server instances, namespace configuration for workflows, jobs, and interactive sessions, and CORS setup for the frontend. This module provides the WebSocket infrastructure that all real-time features build upon.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 022 (Bootstrap NestJS Application — module is imported by AppModule), 023 (Zod Configuration Module — provides `REDIS_URL` config)
- **Blocks**: 072 (Workflow Realtime Gateway), 073 (Interactive Worker Gateway), 074 (Realtime Bridge Service), 075 (Realtime Module Tests)

## Architecture Reference
Socket.IO provides bidirectional real-time communication between the API and frontend clients. The Redis adapter (`@socket.io/redis-adapter`) enables WebSocket events to be broadcast across multiple API server instances — when one server emits to a room, clients connected to other servers in the same room also receive the event. NestJS integrates Socket.IO via `@nestjs/websockets` and `@nestjs/platform-socket.io`. Namespaces separate concerns: `/workflows` for Assembly Line and Worker Pool status, `/jobs` for individual job execution details, `/interactive` for Worker question/answer bidirectional flow.

## Files and Folders
- `/apps/api/src/modules/realtime/realtime.module.ts` — NestJS module configuring Socket.IO server with Redis adapter and namespace definitions

## Acceptance Criteria
- [ ] Installs `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@socket.io/redis-adapter`, `redis` (or `ioredis`)
- [ ] Configures Socket.IO server with Redis adapter reading `REDIS_URL` from ConfigModule
- [ ] Defines namespaces: `/workflows`, `/jobs`, `/interactive`
- [ ] CORS configured to allow the frontend origin (`CORS_ORIGIN` env var, default `http://localhost:5173`)
- [ ] Module exports gateway classes for use by other modules
- [ ] Redis adapter handles pub/sub for cross-instance event broadcasting
- [ ] Handles Redis connection failures gracefully — logs warning, falls back to single-instance mode (no Redis adapter)
- [ ] WebSocket connection/disconnection events are logged at debug level
- [ ] Module is importable by `AppModule`

## Implementation Notes
- NestJS WebSocket gateways are registered as providers, not controllers. The module needs to provide the gateway classes (tasks 072, 073) and export them for the bridge service (task 074) to use.
- Redis adapter setup with `ioredis`:
  ```typescript
  import { createAdapter } from '@socket.io/redis-adapter';
  import { createClient } from 'redis';
  // In the gateway's afterInit:
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  server.adapter(createAdapter(pubClient, subClient));
  ```
- The Redis adapter uses two connections: one for publishing and one for subscribing. Both must be connected before attaching the adapter.
- For local development without Redis, the adapter should be optional — Socket.IO works fine without it in single-instance mode.
- Namespace configuration is done via the `@WebSocketGateway({ namespace: '/workflows' })` decorator on individual gateway classes, not centrally in the module. The module's role is to configure the underlying Socket.IO server options.
- Consider adding authentication middleware to the Socket.IO server to validate JWT tokens on WebSocket connections. This can be a follow-up or done inline.
