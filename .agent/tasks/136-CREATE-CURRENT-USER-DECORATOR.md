# Task 136: Create CurrentUser Decorator

## Summary
Create a `@CurrentUser()` custom parameter decorator that extracts the user context from the request object (set by the `AuthGuard`) and provides it as a typed parameter to controller method handlers. This gives controllers a clean, declarative way to access the authenticated user.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: 135 (Passthrough Auth Guard — sets `request.user`)
- **Blocks**: None

## Architecture Reference
NestJS custom parameter decorators use `createParamDecorator` to extract data from the `ExecutionContext`. The `@CurrentUser()` decorator reads `request.user` (populated by `AuthGuard`) and returns it as a typed `User` object. This pattern decouples controllers from the request object and makes the auth contract explicit in method signatures.

The decorator supports both HTTP and WebSocket execution contexts so it works seamlessly with REST controllers and Socket.IO gateways.

## Files and Folders
- `/apps/api/src/common/decorators/current-user.decorator.ts` — `@CurrentUser()` parameter decorator

## Acceptance Criteria
- [ ] `CurrentUser` is created using `createParamDecorator` from `@nestjs/common`
- [ ] Reads user from `request.user` for HTTP contexts (`context.switchToHttp().getRequest()`)
- [ ] Reads user from `client.data.user` for WebSocket contexts (`context.switchToWs().getClient()`)
- [ ] Return type is typed as `User` from the auth schema (or a compatible interface)
- [ ] Works as a parameter decorator: `@CurrentUser() user: User`
- [ ] Supports optional property access: `@CurrentUser('id') userId: string` to extract a single field
- [ ] File compiles without TypeScript errors
- [ ] Example usage documented in code comments

## Implementation Notes
- Implementation pattern:
  ```ts
  import { createParamDecorator, ExecutionContext } from "@nestjs/common";

  export const CurrentUser = createParamDecorator(
    (data: string | undefined, ctx: ExecutionContext) => {
      let user: unknown;

      switch (ctx.getType()) {
        case "http": {
          const request = ctx.switchToHttp().getRequest();
          user = request.user;
          break;
        }
        case "ws": {
          const client = ctx.switchToWs().getClient();
          user = client.data?.user;
          break;
        }
        default:
          user = undefined;
      }

      // If a specific property was requested (e.g., @CurrentUser('id')), return just that field
      return data ? (user as Record<string, unknown>)?.[data] : user;
    },
  );
  ```
- The `data` parameter in `createParamDecorator` corresponds to the argument passed to the decorator. When used as `@CurrentUser()`, `data` is `undefined` and the full user object is returned. When used as `@CurrentUser('email')`, `data` is `'email'` and only that field is returned.
- For WebSocket contexts, Socket.IO stores handshake data on `client.data`. The auth guard (or a WS-specific guard in the future) should set `client.data.user` during the connection handshake.
- Consider exporting a `UserPayload` interface alongside the decorator for type safety in controllers that don't want to depend on the full Drizzle `User` type:
  ```ts
  export interface UserPayload {
    id: string;
    email: string;
    name: string;
  }
  ```
