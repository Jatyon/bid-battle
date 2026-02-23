import { ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { HttpExceptionFilter } from './http-exception.filter';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { DeepMocked } from '@golevelup/ts-jest';
import { QueryFailedError } from 'typeorm';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockI18nService: DeepMocked<I18nService>;
  let mockConfigService: DeepMocked<AppConfigService>;

  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockImplementation(() => ({
    json: mockJson,
  }));
  const mockResponse = { status: mockStatus };
  const mockRequest = { url: '/test-path', method: 'POST' };

  const mockArgumentsHost = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    jest.clearAllMocks();

    mockI18nService = {
      t: jest.fn().mockImplementation((key: string) => Promise.resolve(`translated_${key}`)),
    } as unknown as DeepMocked<I18nService>;

    mockConfigService = {
      i18n: { fallbackLanguage: 'en' },
    } as unknown as DeepMocked<AppConfigService>;

    jest.spyOn(I18nContext, 'current').mockReturnValue({ lang: 'en' } as unknown as I18nContext<unknown>);

    filter = new HttpExceptionFilter(mockI18nService, mockConfigService);

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('HttpException handling', () => {
    it('should handle standard HttpException correctly', async () => {
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

      await filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          path: '/test-path',
          method: 'POST',
          timestamp: expect.any(String) as unknown,
        }),
      );
    });

    it('should handle HttpException with object response, array of messages, and args', async () => {
      const responsePayload = {
        message: ['validation_error_1', 'validation_error_2'],
        error: 'Bad Request',
        args: { field: 'email' },
      };
      const exception = new HttpException(responsePayload, HttpStatus.BAD_REQUEST);

      await filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['translated_validation_error_1', 'translated_validation_error_2'],
          error: 'translated_error.Bad Request',
        }),
      );
    });

    it('should handle HttpException with object response and a string message (not array)', async () => {
      const responsePayload = {
        message: 'single_error_message',
        error: 'Not Found',
      };
      const exception = new HttpException(responsePayload, HttpStatus.NOT_FOUND);

      await filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'translated_single_error_message',
          error: 'translated_error.Not Found',
        }),
      );
    });
  });

  describe('Database Errors (QueryFailedError)', () => {
    it('should handle MySQL duplicate entry error (errno: 1062)', async () => {
      const exception = new QueryFailedError('query', [], new Error('Duplicate entry'));

      Object.assign(exception, { driverError: { errno: 1062 } });

      await filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          message: 'translated_error.database_unique_constraint',
        }),
      );
    });

    it('should handle generic database error', async () => {
      const exception = new QueryFailedError('query', [], new Error('Some DB error'));
      Object.assign(exception, { driverError: { errno: 9999 } });

      await filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'translated_error.database_query_failed',
        }),
      );
    });

    it('should handle MySQL foreign key error (errno: 1451)', async () => {
      const exception = new QueryFailedError('query', [], new Error('Foreign key constraint failed'));
      Object.assign(exception, { driverError: { errno: 1451 } });

      await filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'translated_error.database_foreign_key',
          error: 'translated_error.Bad Request',
        }),
      );
    });
  });

  describe('Generic Error handling', () => {
    it('should handle unknown Error as Internal Server Error', async () => {
      const exception = new Error('Kaboom!');

      await filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'translated_error.Generic Error',
        }),
      );
    });
  });

  describe('Translation Error Handling', () => {
    it('should return raw key if i18n translation throws an error', async () => {
      (mockI18nService.t as unknown as jest.Mock).mockRejectedValueOnce(new Error('i18n crash'));

      const exception = new Error('Any error');

      await filter.catch(exception, mockArgumentsHost);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'error.Generic Error',
          error: 'translated_error.Internal Server Error',
        }),
      );
    });
  });
});
