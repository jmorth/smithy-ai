# Task 059: Create Worker SDK API Client

## Summary
Create the REST API client used inside Worker containers to communicate back to the Smithy API. This client handles status updates, question submission for interactive Workers, answer polling, and output Package creation. It uses native `fetch` (no external HTTP dependencies) and reads connection details from environment variables.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 057 (SmithyWorker Base Class — client is used by the SDK runtime)
- **Blocks**: 058 (Worker Execution Context — context uses the client for API calls)

## Architecture Reference
The API client runs inside ephemeral Docker containers alongside the Worker code. It communicates with the Smithy API server over HTTP using the `SMITHY_API_URL` base URL and authenticates with `SMITHY_API_KEY` (a per-job ephemeral token). The client is a lightweight wrapper around native `fetch` — no Axios, no got, no external HTTP libraries. This keeps the Worker SDK's dependency footprint minimal. The client is consumed by the `WorkerContext` (task 058) and the runner (task 061).

## Files and Folders
- `/packages/worker-sdk/src/api-client.ts` — `SmithyApiClient` class with methods for status updates, questions, and output creation

## Acceptance Criteria
- [ ] Uses native `fetch` (Node 20 built-in) — no external HTTP dependencies
- [ ] Reads `SMITHY_API_URL` and `SMITHY_API_KEY` from environment variables (passed via constructor or env)
- [ ] `updateStatus(jobId: string, state: JobState)` — sends PUT to `/api/jobs/{jobId}/status` with the new state
- [ ] `submitQuestion(jobId: string, question: string, options?: { choices?: string[] })` — sends POST to `/api/jobs/{jobId}/questions`, returns `questionId`
- [ ] `awaitAnswer(jobId: string, questionId: string)` — polls GET `/api/jobs/{jobId}/questions/{questionId}` with exponential backoff (starting at 500ms, max 5s, up to configurable timeout), returns the answer string when available
- [ ] `createOutputPackage(jobId: string, files: FileEntry[], metadata: Record<string, unknown>)` — sends POST to `/api/jobs/{jobId}/output` with multipart or JSON payload
- [ ] All requests include `Authorization: Bearer {SMITHY_API_KEY}` header
- [ ] All requests include `Content-Type: application/json` header (except multipart)
- [ ] Retries transient failures (HTTP 500, 502, 503, 504, network errors) up to 3 times with exponential backoff
- [ ] Non-retryable errors (4xx) throw immediately with descriptive messages
- [ ] Request timeout of 30 seconds per request (configurable)

## Implementation Notes
- The exponential backoff for `awaitAnswer` is separate from the retry logic. Retries handle transient failures on individual requests; `awaitAnswer` repeatedly makes successful requests until the answer is present (or timeout).
- For `createOutputPackage`, if files are small (< 1MB total), send as JSON with base64-encoded file contents. For larger payloads, consider multipart/form-data. Start with JSON for simplicity.
- The `SMITHY_API_KEY` is an ephemeral token generated per job execution. In the MVP, this may be a simple shared secret. The API side validates it via middleware.
- Use `AbortController` with `setTimeout` for request timeouts — this is the native way to timeout fetch requests in Node 20.
- Add a `healthCheck()` method that calls GET `/api/health` — the runner can use this at startup to verify API connectivity before starting the Worker.
- Log all API calls at debug level (URL, method, status code, duration) using the structured logger. Do NOT log request/response bodies (may contain sensitive data).
