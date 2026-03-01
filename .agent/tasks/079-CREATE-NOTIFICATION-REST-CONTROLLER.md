# Task 079: Create Notification REST Controller

## Summary
Create `NotificationsService` facade that routes domain events to the appropriate notification channels (email, in-app, webhook), plus `NotificationsController` providing REST endpoints for in-app notification management and webhook endpoint CRUD. The `NotificationsModule` wires all channel services together into a cohesive notification system.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 076 (Email Service), 077 (In-App Service), 078 (Webhook Service)
- **Blocks**: 080 (Notification Module Tests)

## Architecture Reference
The `NotificationsService` is the single entry point for triggering notifications from the rest of the application. Domain event handlers (task 069) call `notificationsService.notify(event)` and the facade determines which channels to activate based on the event type and user preferences. The `NotificationsController` exposes REST endpoints for the frontend to manage in-app notifications (list, mark read) and webhook endpoints (CRUD). The `NotificationsModule` ties everything together and is imported by the `AppModule`.

## Files and Folders
- `/apps/api/src/modules/notifications/notifications.service.ts` — Facade service routing events to channels
- `/apps/api/src/modules/notifications/notifications.controller.ts` — REST controller for notifications and webhook endpoints
- `/apps/api/src/modules/notifications/notifications.module.ts` — NestJS module wiring all notification services

## Acceptance Criteria
- [ ] **NotificationsService**: `notify(event: DomainEvent)` routes to channels based on event type — e.g., `assembly-line.completed` → email + in-app + webhook; `job.error` → email + in-app; `job.stuck` → in-app; `package.created` → in-app only
- [ ] **NotificationsService**: channel routing is configurable (future: per-user notification preferences)
- [ ] **Controller**: `GET /api/notifications` — returns paginated in-app notifications for the authenticated user; supports `?status=SENT&type=JOB_ERROR&page=1&limit=20` query params
- [ ] **Controller**: `PATCH /api/notifications/:id/read` — marks a notification as read; returns 404 if not found or not owned by user
- [ ] **Controller**: `PATCH /api/notifications/read-all` — marks all unread notifications as read for the authenticated user
- [ ] **Controller**: `POST /api/webhook-endpoints` — registers a new webhook endpoint; body: `{ url, secret, events[] }`; validates URL format and event names
- [ ] **Controller**: `GET /api/webhook-endpoints` — lists webhook endpoints for the authenticated user
- [ ] **Controller**: `DELETE /api/webhook-endpoints/:id` — deletes a webhook endpoint; returns 404 if not found or not owned by user
- [ ] **Module**: imports and provides `EmailService`, `InAppService`, `WebhookService`, `NotificationsService`; exports `NotificationsService` for use by event handlers
- [ ] All endpoints require authentication (JWT guard)
- [ ] Request/response DTOs are validated via class-validator decorators

## Implementation Notes
- The `NotificationsService` facade pattern keeps channel logic centralized:
  ```typescript
  async notify(event: DomainEvent): Promise<void> {
    const channels = this.getChannelsForEvent(event.type);
    await Promise.allSettled(
      channels.map(channel => channel.send(event)),
    );
  }
  ```
  Use `Promise.allSettled` (not `Promise.all`) so one channel failure does not prevent other channels from executing.
- The channel routing map can start as a hardcoded configuration object. Future: read from user preferences stored in the database.
- For the notifications list endpoint, return a response shape like:
  ```json
  { "data": [...], "meta": { "page": 1, "limit": 20, "total": 42, "unreadCount": 5 } }
  ```
- The webhook endpoint registration should validate the URL is reachable with a test ping (POST with `{ event: "test.ping" }`) — if the endpoint returns 200, it's confirmed. If it fails, register anyway but log a warning.
- DTOs: `CreateWebhookEndpointDto` (url, secret, events), `ListNotificationsQueryDto` (status, type, page, limit), `MarkReadDto` (notification ID in path param).
- The module should be self-contained — it does not import the `EventsModule`. Instead, event handlers import the `NotificationsModule` to access `NotificationsService`.
