# Task 073: Create Interactive Worker Gateway

## Summary
Create `InteractiveGateway` for bidirectional Worker question/answer flow — pushes questions to the frontend when Workers enter the STUCK state, and receives answers from clients to unblock waiting Workers. This gateway enables the interactive Worker pattern where AI agents can pause and ask humans for clarification.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 071 (Socket.IO Realtime Module — provides the WebSocket infrastructure)
- **Blocks**: 074 (Realtime Bridge Service — routes STUCK events through this gateway)

## Architecture Reference
The `InteractiveGateway` operates on the `/interactive` Socket.IO namespace. The flow: (1) Worker calls `context.askQuestion()` → (2) Worker SDK posts question to API → (3) API sets job to STUCK state → (4) Event bus emits `job.stuck` → (5) Bridge service routes to this gateway → (6) Gateway emits `interactive:question` to the job's room → (7) Frontend displays the question → (8) User submits answer → (9) Client emits `interactive:answer` → (10) Gateway stores the answer in the database → (11) Worker SDK polls and retrieves the answer → (12) Worker resumes processing.

## Files and Folders
- `/apps/api/src/modules/realtime/interactive.gateway.ts` — WebSocket gateway for interactive Worker question/answer exchange

## Acceptance Criteria
- [ ] `@WebSocketGateway({ namespace: '/interactive' })` decorator
- [ ] Handles `subscribe:job` event — client joins room `job:{jobId}` to receive questions for a specific job
- [ ] Emits `interactive:question` event to room `job:{jobId}` when a Worker enters STUCK state — payload: `{ jobId, questionId, question, choices?, askedAt }`
- [ ] Handles `interactive:answer` event from client — payload: `{ jobId, questionId, answer }` — stores the answer in the database (or Redis) for the Worker SDK to poll
- [ ] Validates that the answering client has permission to answer (the job belongs to their Assembly Line/organization)
- [ ] Emits `interactive:answered` confirmation event back to the room after storing the answer
- [ ] Handles `unsubscribe:job` event — client leaves the job room
- [ ] Rejects answers for questions that have already been answered (idempotency guard)
- [ ] Rejects answers for jobs that are not in STUCK state

## Implementation Notes
- The answer storage location should be the same place the Worker SDK's `awaitAnswer` polls. Options: (a) a `job_questions` database table, (b) a Redis key `smithy:job:{jobId}:question:{questionId}:answer`. Redis is faster for polling; database is more durable. Recommend Redis for the answer (ephemeral, polled frequently) with a database record for audit.
- The `interactive:answer` handler should:
  1. Validate the answer (non-empty, job exists, question exists, not already answered)
  2. Store the answer in Redis: `SET smithy:job:{jobId}:question:{questionId}:answer <answer>`
  3. Update the job state from STUCK to PROCESSING
  4. Emit `interactive:answered` to the room
  5. Emit `job.state.changed` event to the event bus
- For permission validation, check that the authenticated user (from the Socket.IO handshake JWT) has access to the Assembly Line that owns the job.
- Consider adding a timeout mechanism: if no answer is received within the Worker's configured timeout, emit `interactive:timeout` to the room and let the Worker handle the timeout error.
- Multiple clients can be in the same job room (e.g., team collaboration). The first answer wins — subsequent answers are rejected with the idempotency guard.
