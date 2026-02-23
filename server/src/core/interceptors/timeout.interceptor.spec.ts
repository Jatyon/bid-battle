import { ExecutionContext, CallHandler, RequestTimeoutException } from '@nestjs/common';
import { TimeoutInterceptor } from './timeout.interceptor';
import { of, throwError, lastValueFrom, TimeoutError } from 'rxjs';

describe('TimeoutInterceptor', () => {
  let interceptor: TimeoutInterceptor;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  beforeEach(() => {
    interceptor = new TimeoutInterceptor(5000);

    mockExecutionContext = {} as unknown as ExecutionContext;

    mockCallHandler = {
      handle: jest.fn(),
    } as unknown as CallHandler;
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('Success flow', () => {
    it('should return data if route finishes successfully', async () => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of('success_data'));

      const result = (await lastValueFrom(interceptor.intercept(mockExecutionContext, mockCallHandler))) as unknown;

      expect(result).toBe('success_data');
    });
  });

  describe('Error handling', () => {
    it('should throw RequestTimeoutException if RxJS TimeoutError occurs', async () => {
      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => new TimeoutError()));

      const interceptorObservable = interceptor.intercept(mockExecutionContext, mockCallHandler);

      await expect(lastValueFrom(interceptorObservable)).rejects.toThrow(RequestTimeoutException);
    });

    it('should pass through other errors without modifying them', async () => {
      const standardError = new Error('Some standard error');
      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => standardError));

      const interceptorObservable = interceptor.intercept(mockExecutionContext, mockCallHandler);

      await expect(lastValueFrom(interceptorObservable)).rejects.toThrow(standardError);
    });
  });
});
