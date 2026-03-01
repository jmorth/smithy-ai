# Task 135: Create Passthrough Auth Guard

## Summary
Create a NestJS `AuthGuard` that always passes for the MVP — it unconditionally returns `true` and attaches a hard-coded default user context to the request object. This guard is designed to be swapped to real JWT validation when multi-tenant auth is implemented.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: 134 (Auth Database Schema — provides the `User` type), 022 (NestJS module structure)
- **Blocks**: 136 (CurrentUser Decorator)

## Architecture Reference
In the MVP, Smithy is single-user and does not enforce authentication. However, the codebase should be structured so that adding real auth later is a minimal-diff change. The passthrough guard implements NestJS's `CanActivate` interface and sets `request.user` to a stub object matching the `User` type from the auth schema. Controllers that want to be auth-aware can apply `@UseGuards(AuthGuard)` — in MVP this is a no-op, but when the guard is swapped to JWT validation, those controllers are automatically protected.

The guard is **not** applied globally in the MVP. It is opt-in per controller or route so that health checks and public endpoints remain unguarded.

## Files and Folders
- `/apps/api/src/common/guards/auth.guard.ts` — Passthrough `AuthGuard` implementation

## Acceptance Criteria
- [ ] `AuthGuard` implements `CanActivate` from `@nestjs/common`
- [ ] `canActivate()` always returns `true`
- [ ] `canActivate()` attaches a default user object to `request.user` with shape: `{ id: 'default-user', email: 'admin@smithy.local', name: 'Admin' }`
- [ ] The default user object satisfies the `User` type from `apps/api/src/database/schema/auth.ts` (minus DB-only fields like `createdAt`/`updatedAt`)
- [ ] Guard is exported and importable but NOT registered as a global guard (APP_GUARD)
- [ ] Code contains a clear `// TODO: Replace with JWT validation for multi-tenant` comment
- [ ] Guard handles both HTTP (`ExecutionContext.switchToHttp()`) contexts
- [ ] File compiles without TypeScript errors

## Implementation Notes
- Implementation pattern:
  ```ts
  import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";

  // TODO: Replace with JWT validation for multi-tenant
  const DEFAULT_USER = {
    id: "default-user",
    email: "admin@smithy.local",
    name: "Admin",
  };

  @Injectable()
  export class AuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest();
      request.user = DEFAULT_USER;
      return true;
    }
  }
  ```
- When real auth is implemented, this guard will be replaced with JWT token extraction, validation against `JwtSettings`, and a database lookup for the user. The `request.user` assignment pattern stays the same — only the source of the user object changes.
- Consider also handling `switchToWs()` for WebSocket contexts if Socket.IO gateways need user context. For MVP, HTTP-only is sufficient — document the WS gap with a TODO.
- Do not add this guard to any `providers` array globally. Individual controllers or routes should apply it via `@UseGuards(AuthGuard)` as needed.
