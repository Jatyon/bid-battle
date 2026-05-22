import { CustomParamFactory } from '@nestjs/common/interfaces';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ExecutionContext } from '@nestjs/common';
import { createMock } from '@golevelup/ts-jest';
import { Cookie } from './cookie.decorator';

interface RouteArgsMetadata {
  [key: string]: {
    factory: CustomParamFactory;
  };
}
function getParamDecoratorFactory(decorator: () => ParameterDecorator): CustomParamFactory {
  class TestClass {
    public testMethod(@decorator() value: unknown) {
      return value;
    }
  }

  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass, 'testMethod') as RouteArgsMetadata;

  const firstKey = Object.keys(args)[0];
  if (!firstKey) throw new Error('Decorator metadata not found');

  return args[firstKey].factory;
}

describe('@Cookie() Decorator', () => {
  let factory: (data: string | undefined, ctx: ExecutionContext) => string | Record<string, string> | undefined;

  beforeAll(() => {
    factory = getParamDecoratorFactory(Cookie) as typeof factory;
  });

  it('should return undefined if request.cookies is undefined (e.g. cookie-parser missing)', () => {
    const ctx = createMock<ExecutionContext>({
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    });

    const result = factory(undefined, ctx);

    expect(result).toBeUndefined();
  });

  it('should return the entire cookies object if no cookieName is provided', () => {
    const mockCookies = { session_id: '12345', theme: 'dark' };
    const ctx = createMock<ExecutionContext>({
      switchToHttp: () => ({
        getRequest: () => ({
          cookies: mockCookies,
        }),
      }),
    });

    const result = factory(undefined, ctx);

    expect(result).toEqual(mockCookies);
  });

  it('should return a specific cookie value if cookieName is provided', () => {
    const mockCookies = { session_id: '12345', theme: 'dark' };
    const ctx = createMock<ExecutionContext>({
      switchToHttp: () => ({
        getRequest: () => ({
          cookies: mockCookies,
        }),
      }),
    });

    const result = factory('session_id', ctx);

    expect(result).toBe('12345');
  });

  it('should return undefined if cookieName is provided but the cookie does not exist', () => {
    const mockCookies = { session_id: '12345' };
    const ctx = createMock<ExecutionContext>({
      switchToHttp: () => ({
        getRequest: () => ({
          cookies: mockCookies,
        }),
      }),
    });

    const result = factory('missing_cookie', ctx);

    expect(result).toBeUndefined();
  });
});
