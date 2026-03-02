import { describe, it, expect } from 'vitest';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

function getParamDecoratorFactory(decorator: Function) {
  class Test {
    test(@decorator() _user: any) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Test, 'test');
  return args[Object.keys(args)[0]].factory;
}

describe('CurrentUser decorator', () => {
  it('extracts user from request', () => {
    const factory = getParamDecoratorFactory(CurrentUser);
    const user = { id: 'user-123' };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    };

    const result = factory(undefined, ctx);
    expect(result).toEqual({ id: 'user-123' });
  });

  it('returns undefined when no user on request', () => {
    const factory = getParamDecoratorFactory(CurrentUser);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    };

    const result = factory(undefined, ctx);
    expect(result).toBeUndefined();
  });
});
