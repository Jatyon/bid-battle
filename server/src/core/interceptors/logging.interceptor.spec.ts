import { ExecutionContext, CallHandler, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { LoggingInterceptor } from './logging.interceptor';
import { I18nService } from 'nestjs-i18n';
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
  let i18nMock: { t: jest.Mock };

  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    i18nMock = {
      t: jest.fn().mockImplementation((key: string, opts?: { lang?: string }) => `en:${key}:${opts?.lang ?? 'default'}`),
    };

    const configMock = {
      i18n: { fallbackLanguage: 'en' },
    } as AppConfigService;

    interceptor = new LoggingInterceptor(i18nMock as unknown as I18nService, configMock);

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
  });

  describe('Error path logging', () => {
    it('should log HttpException message translated to fallback language', async () => {
      const error = new HttpException('auth.errors.invalid_credential', HttpStatus.UNAUTHORIZED);

      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => error));

      await expect(lastValueFrom(interceptor.intercept(mockExecutionContext, mockCallHandler))).rejects.toThrow(error);

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/GET \/api\/data - en:auth\.errors\.invalid_credential:en - \d+ms/));
    });

    it('should log generic Error message as-is', async () => {
      const error = new Error('Something went wrong');

      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => error));

      await expect(lastValueFrom(interceptor.intercept(mockExecutionContext, mockCallHandler))).rejects.toThrow(error);

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/GET \/api\/data - Something went wrong - \d+ms/));
    });
  });
});
