import { ExecutionContext, CallHandler } from '@nestjs/common';
import { TransformInterceptor } from './transform.interceptor';
import { of, lastValueFrom, Observable } from 'rxjs';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler<unknown>;
  let mockResponse: { statusCode: number };

  beforeEach(() => {
    interceptor = new TransformInterceptor();

    mockResponse = { statusCode: 200 };

    mockExecutionContext = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('Standard Response Wrapping', () => {
    it('should wrap a simple primitive value (string) in data property', async () => {
      const payload = 'just a string';

      mockCallHandler = { handle: (): Observable<unknown> => of(payload) };

      const requestObservable = interceptor.intercept(mockExecutionContext, mockCallHandler);

      const result = (await lastValueFrom(requestObservable)) as unknown as Record<string, unknown>;

      expect(result).toEqual({
        statusCode: 200,
        data: payload,
        timestamp: expect.any(String) as unknown,
      });
    });

    it('should wrap a standard object without "data" key', async () => {
      const payload = { id: 1, name: 'John Doe' };
      mockCallHandler = { handle: (): Observable<unknown> => of(payload) };

      const requestObservable = interceptor.intercept(mockExecutionContext, mockCallHandler);
      const result = (await lastValueFrom(requestObservable)) as unknown as Record<string, unknown>;

      expect(result).toEqual({
        statusCode: 200,
        data: payload,
        timestamp: expect.any(String) as unknown,
      });
    });

    it('should safely handle null response', async () => {
      const payload = null;
      mockCallHandler = { handle: (): Observable<unknown> => of(payload) };

      const requestObservable = interceptor.intercept(mockExecutionContext, mockCallHandler);
      const result = (await lastValueFrom(requestObservable)) as unknown as Record<string, unknown>;

      expect(result).toEqual({
        statusCode: 200,
        data: null,
        timestamp: expect.any(String) as unknown,
      });
    });
  });

  describe('Complex/Paginated Response Handling', () => {
    it('should extract data and merge meta properties at root level if response has "data" key', async () => {
      const payload = {
        data: [{ id: 1 }, { id: 2 }],
        meta: { total: 10, currentPage: 1 },
        links: { next: 'http://next.page' },
      };

      mockCallHandler = { handle: (): Observable<unknown> => of(payload) };

      const requestObservable = interceptor.intercept(mockExecutionContext, mockCallHandler);
      const result = (await lastValueFrom(requestObservable)) as unknown as Record<string, unknown>;

      expect(result).toEqual({
        statusCode: 200,
        data: payload.data,
        meta: payload.meta,
        links: payload.links,
        timestamp: expect.any(String) as unknown,
      });
    });
  });
});
