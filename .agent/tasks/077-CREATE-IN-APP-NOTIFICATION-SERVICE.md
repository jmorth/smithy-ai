# Task 077: Create In-App Notification Service

## Summary
Create `InAppService` that persists notifications to the `notifications` database table and pushes them in real-time via Socket.IO for immediate display in the frontend. Notifications have lifecycle states (PENDING, SENT, READ) and support pagination and filtering for the notification center UI.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 024 (Database Provider Module — provides database access), 017 (Database Schema/Migrations — notifications table), 071 (Socket.IO Realtime Module — provides real-time push)
- **Blocks**: 079 (Notification REST Controller — facade routes to this channel)

## Architecture Reference
In-app notifications are persistent records stored in the `notifications` database table. Each notification has a type, payload, recipient (user ID), and status. When created, the notification is inserted into the database with status PENDING, then pushed via Socket.IO to the user's notification room (`user:{userId}:notifications`). The frontend maintains a notification badge count and a notification center dropdown that queries the REST API for paginated history. The service is one of three notification channels alongside email and webhooks.

## Files and Folders
- `/apps/api/src/modules/notifications/channels/in-app.service.ts` — In-app notification channel with persistence and Socket.IO push

## Acceptance Criteria
- [ ] `createNotification(type: NotificationType, payload: NotificationPayload, recipientId: string)` inserts into `notifications` table with status `PENDING`
- [ ] After insert, status transitions to `SENT` (confirming persistence)
- [ ] After insert, pushes the notification via Socket.IO to room `user:{recipientId}:notifications` with event `notification:new`
- [ ] `markRead(notificationId: string)` updates status to `READ` and sets `readAt` timestamp
- [ ] `markAllRead(recipientId: string)` marks all SENT notifications for the user as READ
- [ ] `listNotifications(recipientId: string, filters?: { type?, status?, after?, before? }, pagination?: { page, limit })` returns paginated results with total count
- [ ] `getUnreadCount(recipientId: string)` returns the count of SENT (unread) notifications
- [ ] Notification types include: `PACKAGE_CREATED`, `PACKAGE_PROCESSED`, `JOB_ERROR`, `JOB_STUCK`, `ASSEMBLY_LINE_COMPLETED`, `ASSEMBLY_LINE_STEP_COMPLETED`
- [ ] The service is injectable via NestJS DI (`@Injectable()`)

## Implementation Notes
- The `notifications` table schema should include: `id` (UUID), `type` (enum), `payload` (JSONB), `recipientId` (FK to users), `status` (enum: PENDING, SENT, READ), `readAt` (nullable timestamp), `createdAt`, `updatedAt`.
- The Socket.IO push uses the workflow gateway's server instance. Inject the gateway or use a shared `Server` reference:
  ```typescript
  this.server.to(`user:${recipientId}:notifications`).emit('notification:new', notification);
  ```
- For the frontend, the user's Socket.IO client automatically joins their notification room on connection (handled by the gateway's `handleConnection` using the JWT user ID).
- Pagination should use offset-based pagination for simplicity. Cursor-based pagination is a future optimization.
- Consider adding a `deleteNotification(id)` method for users to dismiss notifications, though this can be a follow-up.
- The JSONB payload allows flexible notification content without schema changes. Each notification type has its own payload shape (typed via discriminated union in TypeScript).
- Index the `notifications` table on `(recipientId, status, createdAt)` for efficient queries.
