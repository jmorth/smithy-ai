# Task 017: Create Jobs and Notifications Database Schemas

## Summary
Create the Drizzle schema for `job_executions`, `notifications`, and `webhook_endpoints` tables. Job executions track the lifecycle of individual worker invocations, notifications handle multi-channel alerting, and webhook endpoints enable external system integration via event callbacks.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 013 (Drizzle ORM Configuration), 014 (Packages Schema — references `packages`), 015 (Workers Schema — references `worker_versions`)
- **Blocks**: 018 (Relations and Migration), 067+ (event/notification modules in Phase 4)

## Architecture Reference
In the Smithy domain model:
- **Job Execution** — Tracks a single invocation of a worker version against a package. Records the full lifecycle: queued → running → completed/stuck/error/cancelled. Stores container ID for Docker tracking, retry count, error messages, and structured log entries.
- **Notification** — A multi-channel message (email, in-app, webhook) triggered by system events. Tracks delivery status.
- **Webhook Endpoint** — An external URL registered to receive event callbacks. Supports filtering by event type and includes a shared secret for payload verification.

## Files and Folders
- `/apps/api/src/database/schema/jobs.ts` — Drizzle schema for `job_executions` table and `jobStatus` enum
- `/apps/api/src/database/schema/notifications.ts` — Drizzle schema for `notifications` and `webhook_endpoints` tables, plus `notificationType` and `notificationStatus` enums

## Acceptance Criteria
- [ ] `job_executions` table has: `id` (uuid PK), `package_id` (uuid, FK to packages, not null), `worker_version_id` (uuid, FK to worker_versions, not null), `status` (enum: QUEUED/RUNNING/COMPLETED/STUCK/ERROR/CANCELLED), `container_id` (varchar, nullable), `started_at` (timestamp, nullable), `completed_at` (timestamp, nullable), `error_message` (text, nullable), `retry_count` (integer, default 0), `logs` (jsonb, default `[]`), `created_at` (timestamp, default now)
- [ ] `notifications` table has: `id` (uuid PK), `type` (enum: EMAIL/IN_APP/WEBHOOK), `recipient` (varchar, not null), `payload` (jsonb, not null), `status` (enum: PENDING/SENT/FAILED), `sent_at` (timestamp, nullable), `created_at` (timestamp, default now)
- [ ] `webhook_endpoints` table has: `id` (uuid PK), `url` (varchar, not null), `secret` (varchar, not null), `events` (text array, not null), `active` (boolean, default true), `created_at` (timestamp, default now)
- [ ] All enums are defined as PostgreSQL enums via `pgEnum`
- [ ] All tables, columns, and enums are exported
- [ ] Schema files compile without error

## Implementation Notes
- Define the job status enum:
  ```ts
  export const jobStatusEnum = pgEnum("job_status", [
    "QUEUED", "RUNNING", "COMPLETED", "STUCK", "ERROR", "CANCELLED"
  ]);
  ```
- Define notification enums:
  ```ts
  export const notificationTypeEnum = pgEnum("notification_type", ["EMAIL", "IN_APP", "WEBHOOK"]);
  export const notificationStatusEnum = pgEnum("notification_status", ["PENDING", "SENT", "FAILED"]);
  ```
- The `logs` JSONB column in `job_executions` stores structured log entries as an array. Each entry will have a timestamp, level, and message. Default to an empty array `[]`.
- The `events` column in `webhook_endpoints` is a PostgreSQL text array (`text[]`), not JSONB. Use Drizzle's `text("events").array()` or equivalent.
- The `secret` in `webhook_endpoints` is used for HMAC signature verification of webhook payloads — it should be generated server-side, never user-provided.
- Import `packages` from `./packages.ts` and `workerVersions` from `./workers.ts` for FK references.
- Consider adding indexes on `job_executions.package_id`, `job_executions.status`, and `job_executions.worker_version_id` for query performance.
