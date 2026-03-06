import { describe, it, expect } from 'vitest';
import { AuthGuard } from './auth.guard';

function createMockContext() {
  const request = { user: undefined as any };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    request,
  };
}

describe('AuthGuard', () => {
  const guard = new AuthGuard();

  it('always returns true', () => {
    const ctx = createMockContext();
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('attaches the default user to request.user', () => {
    const ctx = createMockContext();
    guard.canActivate(ctx as any);

    expect(ctx.request.user).toEqual({
      id: 'default-user',
      email: 'admin@smithy.local',
      name: 'Admin',
    });
  });

  it('default user has id, email, and name fields', () => {
    const ctx = createMockContext();
    guard.canActivate(ctx as any);

    expect(ctx.request.user).toHaveProperty('id', 'default-user');
    expect(ctx.request.user).toHaveProperty('email', 'admin@smithy.local');
    expect(ctx.request.user).toHaveProperty('name', 'Admin');
  });

  it('overwrites any existing request.user', () => {
    const ctx = createMockContext();
    ctx.request.user = { id: 'old-user' };
    guard.canActivate(ctx as any);

    expect(ctx.request.user.id).toBe('default-user');
  });

  it('returns true on repeated calls', () => {
    const ctx = createMockContext();
    expect(guard.canActivate(ctx as any)).toBe(true);
    expect(guard.canActivate(ctx as any)).toBe(true);
  });
});
