import { describe, it, expect } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function createMockContext(headers: Record<string, string> = {}) {
  const request = { headers, user: undefined as any };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    request,
  };
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard();

  it('allows access with valid Bearer token', () => {
    const ctx = createMockContext({
      authorization: 'Bearer user-123',
    });

    const result = guard.canActivate(ctx as any);

    expect(result).toBe(true);
    expect(ctx.request.user).toEqual({ id: 'user-123' });
  });

  it('throws UnauthorizedException when no authorization header', () => {
    const ctx = createMockContext({});

    expect(() => guard.canActivate(ctx as any)).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when authorization header missing Bearer prefix', () => {
    const ctx = createMockContext({
      authorization: 'Basic abc123',
    });

    expect(() => guard.canActivate(ctx as any)).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when Bearer token is empty', () => {
    const ctx = createMockContext({
      authorization: 'Bearer ',
    });

    expect(() => guard.canActivate(ctx as any)).toThrow(
      UnauthorizedException,
    );
  });

  it('sets user.id from the bearer token value', () => {
    const ctx = createMockContext({
      authorization: 'Bearer my-jwt-token-here',
    });

    guard.canActivate(ctx as any);

    expect(ctx.request.user.id).toBe('my-jwt-token-here');
  });
});
