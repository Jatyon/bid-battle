import { ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { LoggingInterceptor } from './logging.interceptor';
import { of, throwError, lastValueFrom } from 'rxjs';

interface MockRequest {
  method: string;
  url: string;
  ip: string;
  get: jest.Mock;
}

interface MockResponse {
  statusCode: number;
}

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();

    mockRequest = {
      method: 'GET',
      url: '/api/data',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('jest-test-agent'),
    };

    mockResponse = {
      statusCode: 200,
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;

    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of('test-data')),
    };

    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('Bypass logic', () => {
    it('should bypass logging for /health endpoint', async () => {
      mockRequest.url = '/health';

      await lastValueFrom(interceptor.intercept(mockExecutionContext, mockCallHandler));

      expect(mockCallHandler.handle).toHaveBeenCalled();

      expect(loggerLogSpy).not.toHaveBeenCalled();
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Success path logging', () => {
    it('should log start and completion of a request', async () => {
      await lastValueFrom(interceptor.intercept(mockExecutionContext, mockCallHandler));

      expect(loggerLogSpy).toHaveBeenNthCalledWith(1, 'GET /api/data - User Agent: jest-test-agent IP: 127.0.0.1 - Started');

      expect(loggerLogSpy).toHaveBeenNthCalledWith(2, expect.stringMatching(/GET \/api\/data 200 - \d+ms/));
    });

    it('should handle missing user-agent gracefully (fallback to empty string)', async () => {
      mockRequest.get = jest.fn().mockReturnValue(undefined);

      await lastValueFrom(interceptor.intercept(mockExecutionContext, mockCallHandler));

      expect(loggerLogSpy).toHaveBeenNthCalledWith(1, 'GET /api/data - User Agent:  IP: 127.0.0.1 - Started');
    });
  });

  describe('Error path logging', () => {
    it('should log an error when the stream throws an exception', async () => {
      const error = new Error('Something went wrong');

      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => error));

      await expect(lastValueFrom(interceptor.intercept(mockExecutionContext, mockCallHandler))).rejects.toThrow(error);

      expect(loggerLogSpy).toHaveBeenCalledTimes(1);

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/GET \/api\/data - Something went wrong - \d+ms/));
    });
  });
});
