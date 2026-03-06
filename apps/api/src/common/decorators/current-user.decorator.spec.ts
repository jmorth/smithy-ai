import { describe, it, expect } from 'vitest';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser, UserPayload } from './current-user.decorator';

function getParamDecoratorFactory(decorator: (...args: any[]) => ParameterDecorator) {
  class Test {
    test(@decorator() _user: any) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Test, 'test');
  return args[Object.keys(args)[0]].factory;
}

const mockUser: UserPayload = {
  id: 'user-123',
  email: 'admin@smithy.local',
  name: 'Admin',
};

function httpCtx(user?: unknown) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => (user !== undefined ? { user } : {}),
    }),
  };
}

function wsCtx(user?: unknown) {
  return {
    getType: () => 'ws',
    switchToWs: () => ({
      getClient: () => (user !== undefined ? { data: { user } } : { data: {} }),
    }),
  };
}

describe('CurrentUser decorator', () => {
  const factory = getParamDecoratorFactory(CurrentUser);

  describe('HTTP context', () => {
    it('extracts the full user object from request.user', () => {
      const result = factory(undefined, httpCtx(mockUser));
      expect(result).toEqual(mockUser);
    });

    it('returns undefined when no user on request', () => {
      const result = factory(undefined, httpCtx());
      expect(result).toBeUndefined();
    });

    it('extracts a single property when data is provided', () => {
      expect(factory('id', httpCtx(mockUser))).toBe('user-123');
      expect(factory('email', httpCtx(mockUser))).toBe('admin@smithy.local');
      expect(factory('name', httpCtx(mockUser))).toBe('Admin');
    });

    it('returns undefined for a non-existent property', () => {
      expect(factory('nonexistent', httpCtx(mockUser))).toBeUndefined();
    });

    it('returns undefined when extracting a property and user is missing', () => {
      expect(factory('id', httpCtx())).toBeUndefined();
    });
  });

  describe('WebSocket context', () => {
    it('extracts the full user object from client.data.user', () => {
      const result = factory(undefined, wsCtx(mockUser));
      expect(result).toEqual(mockUser);
    });

    it('returns undefined when no user on client data', () => {
      const result = factory(undefined, wsCtx());
      expect(result).toBeUndefined();
    });

    it('extracts a single property when data is provided', () => {
      expect(factory('id', wsCtx(mockUser))).toBe('user-123');
      expect(factory('email', wsCtx(mockUser))).toBe('admin@smithy.local');
    });

    it('returns undefined for a non-existent property', () => {
      expect(factory('nonexistent', wsCtx(mockUser))).toBeUndefined();
    });

    it('handles client with no data property gracefully', () => {
      const ctx = {
        getType: () => 'ws',
        switchToWs: () => ({
          getClient: () => ({}),
        }),
      };
      expect(factory(undefined, ctx)).toBeUndefined();
    });
  });

  describe('unknown context type', () => {
    it('returns undefined for unsupported context types', () => {
      const ctx = { getType: () => 'rpc' };
      expect(factory(undefined, ctx)).toBeUndefined();
    });

    it('returns undefined when extracting a property from unsupported context', () => {
      const ctx = { getType: () => 'rpc' };
      expect(factory('id', ctx)).toBeUndefined();
    });
  });

  describe('UserPayload interface', () => {
    it('exports UserPayload as a valid interface shape', () => {
      const payload: UserPayload = { id: '1', email: 'a@b.com', name: 'Test' };
      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('email');
      expect(payload).toHaveProperty('name');
    });
  });
});
