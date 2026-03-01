# Task 087: Create Socket.IO Client

## Summary
Create a Socket.IO client singleton with auto-reconnection, typed event definitions matching the backend gateway contracts, and namespace management for `/workflows`, `/jobs`, and `/interactive`. This is the real-time communication layer that powers live dashboard updates and the Phaser factory view.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 084 (Initialize Vite + React App), 021 (Event Type Contracts)
- **Blocks**: 088 (Zustand Store — reads connection state), 091 (Dashboard — subscribes to events), 095 (Assembly Line Detail — live updates), 097 (Worker Pool Detail — live updates), 099 (Package Detail — interactive responses), 102+ (Phaser Factory — real-time rendering)

## Architecture Reference
The Socket.IO client connects to the same host as the API (derived from `VITE_API_URL` or `window.location.origin` in production). The backend exposes three Socket.IO namespaces: `/workflows` (assembly line and worker pool events), `/jobs` (job execution lifecycle events), and `/interactive` (human-in-the-loop question/answer). The client maintains a singleton manager that creates namespace connections on demand and cleans them up when no subscribers remain. Event types are imported from `@smithy/shared`.

## Files and Folders
- `/apps/web/src/api/socket.ts` — Socket.IO client manager with namespace connections, typed event subscriptions, connection state tracking, and room join/leave helpers

## Acceptance Criteria
- [ ] Exports a singleton Socket.IO manager (not a raw socket instance)
- [ ] Connects to the same host as the API (extracts host from `VITE_API_URL` or defaults to `window.location.origin`)
- [ ] Supports three namespaces: `/workflows`, `/jobs`, `/interactive`
- [ ] Typed event listeners matching backend gateway event contracts from `@smithy/shared`
- [ ] Auto-reconnect enabled with exponential backoff (initial 1s, max 30s, factor 2)
- [ ] Connection state is observable: exposes a `getState()` method returning `'connected' | 'disconnected' | 'reconnecting'`
- [ ] Connection state changes emit a callback (for Zustand store synchronization)
- [ ] `subscribeAssemblyLine(slug)` — joins the assembly-line-specific room on `/workflows` namespace
- [ ] `subscribeWorkerPool(slug)` — joins the worker-pool-specific room on `/workflows` namespace
- [ ] `subscribeJob(jobId)` — joins the job-specific room on `/jobs` namespace
- [ ] `unsubscribe(room)` — leaves a room and disconnects the namespace if no other subscriptions remain
- [ ] `onEvent(namespace, event, callback)` — registers a typed event listener, returns an unsubscribe function
- [ ] `sendInteractiveResponse(jobId, response)` — emits an answer event on `/interactive` namespace
- [ ] Namespace connections are created lazily (only when first subscribed)
- [ ] Namespace connections are cleaned up when all subscribers for that namespace unsubscribe

## Implementation Notes
- Use `socket.io-client`'s `Manager` class to share a single underlying connection across namespaces. Create namespace sockets via `manager.socket('/workflows')`, etc.
- Track active subscriptions using a `Map<namespace, Set<room>>` to know when a namespace can be disconnected.
- The connection state callback should be invoked on `connect`, `disconnect`, and `reconnect_attempt` events. The Zustand store (task 088) will register this callback to keep `socketState` in sync.
- For typed events, define interfaces like `WorkflowEvents`, `JobEvents`, `InteractiveEvents` that map event names to payload types. Use these as generics on the event listener methods.
- The `subscribeAssemblyLine(slug)` method should emit a `join` event with `{ room: 'assembly-line:${slug}' }` to the `/workflows` namespace. The backend uses rooms for targeted broadcasting.
- Do NOT auto-connect on import. Expose a `connect()` method that is called when the app mounts (in `main.tsx` or a provider). Similarly, expose `disconnect()` for cleanup.
- Handle the case where the backend is unreachable gracefully — the manager should not throw, just report `disconnected` state and keep retrying.
