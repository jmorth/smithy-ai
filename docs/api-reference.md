# API Reference

The Smithy AI API uses a global prefix of `/api` for all endpoints except the health check. All request and response bodies use JSON.

## Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness/readiness check. Returns 200 `{ status: "ok" }` when all services are up, 503 `{ status: "degraded" }` otherwise. Checks PostgreSQL, Redis, and RabbitMQ. |

## Packages

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/packages` | Create a new package |
| `GET` | `/api/packages` | List packages (paginated via `page`, `limit` query params) |
| `GET` | `/api/packages/:id` | Get a package by UUID |
| `PATCH` | `/api/packages/:id` | Update a package |
| `DELETE` | `/api/packages/:id` | Soft-delete a package (returns 204) |
| `POST` | `/api/packages/:id/files/presign` | Request a presigned upload URL |
| `POST` | `/api/packages/:id/files/confirm` | Confirm a completed file upload |
| `GET` | `/api/packages/:id/files` | List all files in a package |
| `DELETE` | `/api/packages/:id/files/:fileId` | Delete a file from a package (returns 204) |

## Workers

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/workers` | Register a new worker |
| `GET` | `/api/workers` | List all workers |
| `GET` | `/api/workers/:slug` | Get a worker by slug |
| `PATCH` | `/api/workers/:slug` | Update worker metadata |
| `POST` | `/api/workers/:slug/versions` | Create a new worker version (validates YAML config) |
| `GET` | `/api/workers/:slug/versions/:version` | Get a specific worker version |
| `PATCH` | `/api/workers/:slug/versions/:version` | Deprecate a worker version |

## Assembly Lines

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/assembly-lines` | Create an assembly line |
| `GET` | `/api/assembly-lines` | List all assembly lines |
| `GET` | `/api/assembly-lines/:slug` | Get an assembly line by slug |
| `PATCH` | `/api/assembly-lines/:slug` | Update an assembly line |
| `DELETE` | `/api/assembly-lines/:slug` | Archive an assembly line (returns 204) |
| `POST` | `/api/assembly-lines/:slug/submit` | Submit a package to an assembly line |
| `GET` | `/api/assembly-lines/:slug/packages` | List packages for an assembly line (paginated) |

## Worker Pools

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/worker-pools` | Create a worker pool |
| `GET` | `/api/worker-pools` | List all worker pools (includes `activeJobCount`) |
| `GET` | `/api/worker-pools/:slug` | Get a worker pool by slug |
| `PATCH` | `/api/worker-pools/:slug` | Update a worker pool |
| `DELETE` | `/api/worker-pools/:slug` | Archive a worker pool (returns 204) |
| `POST` | `/api/worker-pools/:slug/submit` | Submit a package to a worker pool |

## Logs

Authentication required (JWT).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/jobs/:jobId/logs` | Retrieve paginated logs for a job. Query params: `level`, `after`, `before`, `page`, `limit` (max 100). |
| `GET` (SSE) | `/api/jobs/:jobId/logs/stream` | Stream live logs via Server-Sent Events. Emits `log` and `complete` events. Returns 400 if job is in a terminal state. |

## Notifications

Authentication required (JWT).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/notifications` | List notifications. Query params: `status`, `type`, `page`, `limit`. Response includes `unreadCount`. |
| `PATCH` | `/api/notifications/:id/read` | Mark a notification as read |
| `PATCH` | `/api/notifications/read-all` | Mark all notifications as read. Returns `{ updatedCount }`. |
| `POST` | `/api/webhook-endpoints` | Register a webhook endpoint (sends test ping on creation) |
| `GET` | `/api/webhook-endpoints` | List webhook endpoints |
| `DELETE` | `/api/webhook-endpoints/:id` | Delete a webhook endpoint (returns 204) |

---

## WebSocket Events (Socket.IO)

The API uses Socket.IO with a Redis adapter for real-time communication. Three namespaces are available.

### `/jobs` Namespace

Server-push only channel for job status updates. No client-to-server events.

### `/workflows` Namespace

**Client-to-server events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe:assembly-line` | `slug: string` | Join a room for assembly line updates |
| `subscribe:worker-pool` | `slug: string` | Join a room for worker pool updates |
| `unsubscribe:assembly-line` | `slug: string` | Leave an assembly line room |
| `unsubscribe:worker-pool` | `slug: string` | Leave a worker pool room |

**Server-to-client events:**

| Event | Room | Description |
|-------|------|-------------|
| `package:status` | `assembly-line:{slug}` | Package status change |
| `job:state` | `assembly-line:{slug}` or `worker-pool:{slug}` | Job state transition |
| `assembly-line:progress` | `assembly-line:{slug}` | Assembly line progress update |
| `assembly-line:completed` | `assembly-line:{slug}` | Assembly line completed |

Rate limit: max 50 rooms per client.

### `/interactive` Namespace

Handles human-in-the-loop interactions for jobs in `STUCK` state.

**Client-to-server events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe:job` | `jobId: string` | Join a room for a specific job |
| `unsubscribe:job` | `jobId: string` | Leave a job room |
| `interactive:answer` | `{ jobId, questionId, answer }` | Submit an answer to a stuck job's question. Transitions job from `STUCK` to `RUNNING`. |

**Server-to-client events:**

| Event | Room | Description |
|-------|------|-------------|
| `interactive:question` | `job:{jobId}` | New question from a stuck job. Payload: `{ jobId, questionId, question, choices?, askedAt }` |
| `interactive:answered` | `job:{jobId}` | Confirmation that a question was answered. Payload: `{ jobId, questionId, answeredAt }` |

Rate limit: max 50 rooms per client.
