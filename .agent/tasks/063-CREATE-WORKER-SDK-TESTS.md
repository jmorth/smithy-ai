# Task 063: Create Worker SDK Tests

## Summary
Write unit tests for the Worker SDK: runner lifecycle orchestration, API client request handling and retries, and WorkerContext behavior including the interactive `askQuestion` flow. All external dependencies (filesystem, network, AI providers) are mocked — tests run without Docker, API server, or AI provider access.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 057 (SmithyWorker Base Class), 058 (Worker Execution Context), 059 (Worker SDK API Client), 060 (Worker AI Provider Wrapper), 061 (Worker SDK Runner)
- **Blocks**: None

## Architecture Reference
The Worker SDK tests live in the `__tests__` directory of the `worker-sdk` package. They test the SDK's internal logic in isolation. The runner tests verify lifecycle hook ordering and error handling. The API client tests verify request formatting, authentication headers, retry behavior, and timeout handling. The context tests verify the `askQuestion` STUCK-state flow, output builder accumulation, and input file access. All tests use Vitest (consistent with the monorepo test setup).

## Files and Folders
- `/packages/worker-sdk/__tests__/runner.spec.ts` — Runner lifecycle orchestration tests
- `/packages/worker-sdk/__tests__/api-client.spec.ts` — API client request and retry tests
- `/packages/worker-sdk/__tests__/context.spec.ts` — WorkerContext behavior tests

## Acceptance Criteria
- [ ] **Runner tests**: lifecycle hooks called in order (onReceive → onProcess → onComplete); onError called when onProcess throws; exit code 0 on success; exit code 1 on error; uncaught exception handler logs and exits; YAML config is parsed correctly; dynamic import failure produces descriptive error
- [ ] **API client tests**: requests include Authorization header with API key; request URLs are correctly constructed from base URL; `updateStatus` sends correct payload; `submitQuestion` returns questionId from response; `awaitAnswer` polls with exponential backoff until answer available; transient HTTP errors (500, 502, 503) trigger retries; 4xx errors throw immediately without retry; request timeout via AbortController works
- [ ] **Context tests**: `askQuestion` calls submitQuestion then awaitAnswer on the API client; `askQuestion` timeout throws QuestionTimeoutError; `outputBuilder.addFile` accumulates files; `outputBuilder.build()` returns complete PackageOutput; `inputPackage.getFile` reads from the input directory; `logger` writes structured JSON to stdout
- [ ] All tests pass with `pnpm --filter worker-sdk test`
- [ ] No real network calls, filesystem access, or Docker operations in tests

## Implementation Notes
- Mock the filesystem using `jest.mock('fs')` or `memfs` for input file tests. The context reads from `/input` — mock this path.
- Mock `fetch` using `vi.fn()` or a library like `msw` (Mock Service Worker) for API client tests. Prefer `vi.fn()` for simplicity since these are unit tests.
- For runner tests, create a mock Worker class that extends `SmithyWorker` with controllable hooks (resolve/reject on demand).
- For the exponential backoff test in `awaitAnswer`, use `vi.useFakeTimers()` to advance time without actual waiting.
- The `process.exit` calls in the runner should be mockable — either inject a process exit function or mock `process.exit` directly (be careful to restore it in `afterEach`).
- Test the YAML parsing with fixture files containing valid and invalid YAML to verify error messages.
