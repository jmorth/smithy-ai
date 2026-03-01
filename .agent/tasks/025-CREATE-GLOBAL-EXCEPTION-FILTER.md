# Task 025: Create Global Exception Filter

## Summary
Create a global HTTP exception filter that catches all thrown exceptions and returns a consistent JSON error response shape `{ statusCode, message, error, timestamp, path }`. This ensures API consumers always receive predictable error payloads regardless of where an error originates.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 022 (Bootstrap NestJS Application)
- **Blocks**: None directly, but all controllers benefit from consistent error responses

## Architecture Reference
NestJS exception filters intercept unhandled exceptions in the request pipeline. By registering a global filter, every controller endpoint automatically gets standardized error formatting. The filter sits in `apps/api/src/common/filters/` following NestJS convention for cross-cutting concerns. Errors are logged via Pino (injected through nestjs-pino) before the response is sent.

## Files and Folders
- `/apps/api/src/common/filters/http-exception.filter.ts` — Global exception filter implementing `ExceptionFilter`
- `/apps/api/src/main.ts` — Updated to register the filter globally via `app.useGlobalFilters()`

## Acceptance Criteria
- [ ] Filter catches `HttpException` instances and extracts status code and message
- [ ] Filter catches unknown/unexpected exceptions and returns 500 Internal Server Error
- [ ] Response body shape is always: `{ statusCode: number, message: string | string[], error: string, timestamp: string, path: string }`
- [ ] `timestamp` is ISO 8601 format
- [ ] `path` is the request URL that caused the error
- [ ] `error` is the HTTP status text (e.g., "Bad Request", "Not Found", "Internal Server Error")
- [ ] `message` preserves the original exception message; for `BadRequestException` with validation errors, it preserves the array of messages
- [ ] All caught exceptions are logged via Pino logger with appropriate log level (warn for 4xx, error for 5xx)
- [ ] 5xx errors log the full stack trace; 4xx errors log only the message
- [ ] Filter is registered globally in `main.ts`
- [ ] Unknown exceptions do NOT leak internal details (stack traces, class names) to the client in production

## Implementation Notes
- Implement `ExceptionFilter` interface from `@nestjs/common` and decorate with `@Catch()` (no arguments = catch all).
- Use `ArgumentsHost.switchToHttp()` to get the request and response objects.
- For `HttpException`, use `exception.getResponse()` which may return a string or an object with `message` and `error` fields (this is how NestJS validation pipe returns errors).
- For non-HttpException errors, check `NODE_ENV` — in development, include the error message; in production, return a generic "Internal Server Error" message.
- Inject `Logger` from `@nestjs/common` or use `PinoLogger` from `nestjs-pino` directly for structured logging.
- Consider creating an `ErrorResponseDto` class for Swagger documentation in the future.
