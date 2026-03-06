import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Lightweight user shape for controller/gateway type annotations.
 * Mirrors the core columns of the `users` table without importing Drizzle types.
 */
export interface UserPayload {
  id: string;
  email: string;
  name: string;
}

/**
 * Extracts the authenticated user from the request context.
 *
 * Supports both HTTP and WebSocket execution contexts:
 * - HTTP: reads `request.user` (set by AuthGuard)
 * - WS:   reads `client.data.user` (set during Socket.IO handshake)
 *
 * @example
 * // Full user object
 * @Get('profile')
 * getProfile(@CurrentUser() user: UserPayload) { ... }
 *
 * // Single field
 * @Get('profile')
 * getProfile(@CurrentUser('id') userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    let user: unknown;

    switch (ctx.getType()) {
      case 'http': {
        const request = ctx.switchToHttp().getRequest();
        user = request.user;
        break;
      }
      case 'ws': {
        const client = ctx.switchToWs().getClient();
        user = client.data?.user;
        break;
      }
      default:
        user = undefined;
    }

    return data ? (user as Record<string, unknown>)?.[data] : user;
  },
);
