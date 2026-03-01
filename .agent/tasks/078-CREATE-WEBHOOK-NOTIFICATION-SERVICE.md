# Task 078: Create Webhook Notification Service

## Summary
Create `WebhookService` for outgoing webhook delivery — sends HTTP POST requests with JSON payloads to registered endpoints, signs requests with HMAC-SHA256 for verification, and retries failed deliveries with exponential backoff. Endpoints subscribe to specific event types and only receive matching events.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 024 (Database Provider Module — stores webhook endpoints), 017 (Database Schema/Migrations — webhook_endpoints table)
- **Blocks**: 079 (Notification REST Controller — provides CRUD for webhook endpoints)

## Architecture Reference
Outgoing webhooks allow external systems to receive Smithy events in real-time. Users register webhook endpoints with a URL, a shared secret (for HMAC verification), and a list of event types they want to receive. When a matching event occurs, the service sends an HTTP POST with the event payload in the JSON body and an HMAC-SHA256 signature in the `X-Smithy-Signature` header. The receiving system can verify the signature using the shared secret to confirm the request is authentic. Failed deliveries are retried with exponential backoff.

## Files and Folders
- `/apps/api/src/modules/notifications/channels/webhook.service.ts` — Webhook delivery service with HMAC signing and retry logic

## Acceptance Criteria
- [ ] `deliverWebhook(endpointId: string, event: WebhookEvent)` sends HTTP POST to the endpoint's registered URL
- [ ] Request body is JSON: `{ event: string, timestamp: string, payload: object }`
- [ ] Request includes `X-Smithy-Signature` header with HMAC-SHA256 signature: `sha256=<hex digest of body using endpoint secret>`
- [ ] Request includes `X-Smithy-Event` header with the event type string
- [ ] Request includes `Content-Type: application/json` header
- [ ] Retry on failure: 3 attempts with exponential backoff (1s, 5s, 25s)
- [ ] Retryable failures: HTTP 500+, network errors, timeouts. Non-retryable: HTTP 4xx (except 429)
- [ ] HTTP 429 (Too Many Requests) is retried respecting `Retry-After` header if present
- [ ] `registerEndpoint(url: string, secret: string, events: string[])` stores endpoint in `webhook_endpoints` table
- [ ] `listEndpoints(ownerId: string)` returns all endpoints for a user/organization
- [ ] `deleteEndpoint(endpointId: string)` removes an endpoint
- [ ] Only delivers events matching the endpoint's subscribed event list
- [ ] Request timeout of 10 seconds per attempt
- [ ] The service is injectable via NestJS DI (`@Injectable()`)

## Implementation Notes
- HMAC-SHA256 signature generation:
  ```typescript
  import { createHmac } from 'crypto';
  const signature = createHmac('sha256', endpointSecret)
    .update(JSON.stringify(body))
    .digest('hex');
  const header = `sha256=${signature}`;
  ```
- Use native `fetch` for HTTP requests — no external HTTP client needed.
- The `webhook_endpoints` table schema: `id` (UUID), `url` (string), `secret` (encrypted string), `events` (text array or JSONB array), `ownerId` (FK to users), `isActive` (boolean), `createdAt`, `updatedAt`, `lastDeliveryAt` (nullable timestamp), `lastDeliveryStatus` (nullable string).
- The endpoint secret should be stored encrypted in the database. Use the application's encryption key to encrypt/decrypt. For MVP, storing plaintext is acceptable with a TODO for encryption.
- Consider adding a `webhook_deliveries` table to log delivery attempts (for debugging failed webhooks): `endpointId`, `event`, `statusCode`, `responseBody` (truncated), `attemptNumber`, `createdAt`.
- The exponential backoff formula: `delay = baseDelay * Math.pow(5, attempt)` where baseDelay=1s gives 1s, 5s, 25s.
- For production, webhook delivery should be done via a background job queue (RabbitMQ) rather than in-process. For MVP, in-process with async/await is acceptable.
