# Task 080: Create Notification Module Tests

## Summary
Write unit tests for each notification channel (email, webhook) and integration tests for the notifications REST controller. Tests verify Resend API calls, HMAC signature correctness, retry behavior, event filtering, and all controller endpoint responses with proper authentication and authorization.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 079 (Notification REST Controller — the module being tested)
- **Blocks**: None

## Architecture Reference
Tests live in the `notifications` module's `__tests__` directory. Channel tests mock external services (Resend SDK, HTTP fetch for webhooks, database, Socket.IO). Controller tests use NestJS `Test.createTestingModule` with `supertest` for HTTP assertions. Authentication is mocked via a JWT guard override.

## Files and Folders
- `/apps/api/src/modules/notifications/__tests__/email.service.spec.ts` — Unit tests for EmailService
- `/apps/api/src/modules/notifications/__tests__/webhook.service.spec.ts` — Unit tests for WebhookService
- `/apps/api/src/modules/notifications/__tests__/notifications.controller.spec.ts` — Integration tests for REST endpoints

## Acceptance Criteria
- [ ] **Email tests**: `sendAssemblyLineCompleted` calls Resend with correct to, subject, and HTML body; `sendWorkerError` includes error details and log excerpt in HTML; `sendWorkerStuck` includes question text and dashboard link; graceful handling when `RESEND_API_KEY` is not set (logs warning, does not throw); graceful handling when Resend API returns error
- [ ] **Webhook tests**: `deliverWebhook` sends POST to correct URL; HMAC-SHA256 signature in `X-Smithy-Signature` header matches expected value for given body and secret; retry behavior: 3 attempts on 500 error with increasing delays; no retry on 400 error; event filtering: only delivers to endpoints subscribed to the event type; request timeout after 10 seconds; `registerEndpoint` stores in database; `deleteEndpoint` removes from database
- [ ] **Controller tests**: `GET /api/notifications` returns paginated list with correct meta; `PATCH /api/notifications/:id/read` marks as read and returns updated notification; `PATCH /api/notifications/:id/read` returns 404 for non-existent notification; `POST /api/webhook-endpoints` creates endpoint and returns 201; `GET /api/webhook-endpoints` returns list; `DELETE /api/webhook-endpoints/:id` returns 204; all endpoints return 401 without auth token; notifications and endpoints are scoped to the authenticated user (cannot access other users' data)
- [ ] All tests pass with `pnpm --filter api test`

## Implementation Notes
- Mock the Resend SDK:
  ```typescript
  const mockResend = { emails: { send: vi.fn().mockResolvedValue({ id: 'msg_123' }) } };
  ```
- For HMAC signature verification in webhook tests, independently compute the expected signature and compare:
  ```typescript
  const expectedSig = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
  expect(fetchCall.headers['X-Smithy-Signature']).toBe(`sha256=${expectedSig}`);
  ```
- Mock `fetch` for webhook delivery tests. Use `vi.fn()` to capture request arguments and simulate responses.
- For retry behavior tests, use `vi.useFakeTimers()` to avoid real delays. Verify that fetch is called 3 times with increasing intervals.
- Controller tests should use `supertest` with the NestJS test app:
  ```typescript
  const response = await request(app.getHttpServer())
    .get('/api/notifications')
    .set('Authorization', `Bearer ${testJwt}`)
    .expect(200);
  ```
- Override the JWT auth guard in tests to inject a mock user:
  ```typescript
  .overrideGuard(AuthGuard('jwt'))
  .useValue({ canActivate: () => true })
  ```
- Test user scoping by verifying that user A cannot read user B's notifications or webhook endpoints.
