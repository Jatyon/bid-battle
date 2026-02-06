import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AppConfigService } from '@config/services/config.service';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface ErrorResponse {
  message?: string | string[];
  error?: string;
  args?: Record<string, any>;
}

interface IMySqlDriverError {
  errno?: number;
  code?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(
    private readonly i18n: I18nService,
    private readonly configService: AppConfigService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const i18nContext = I18nContext.current();
    const lang = i18nContext?.lang || this.configService.i18n.fallbackLanguage;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal Server Error';
    let errorKey = 'error.Internal Server Error';
    let translationArgs: Record<string, any> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as ErrorResponse;

        if (Array.isArray(res.message)) message = res.message;
        else message = res.message || res.error || message;

        if (res.args) translationArgs = res.args;

        errorKey = res.error ? `error.${res.error}` : errorKey;
      }
    } else if (exception instanceof QueryFailedError) {
      const dbException = exception as QueryFailedError & { driverError?: IMySqlDriverError };
      const driverError = dbException.driverError;

      const errno = driverError?.errno;
      const code = driverError?.code;

      if (errno === 1062 || code === 'ER_DUP_ENTRY') {
        status = HttpStatus.CONFLICT;
        message = 'error.database_unique_constraint';
        errorKey = 'error.Conflict';
      } else if (errno === 1451 || errno === 1452 || (typeof code === 'string' && code.includes('FK_'))) {
        status = HttpStatus.BAD_REQUEST;
        message = 'error.database_foreign_key';
        errorKey = 'error.Bad Request';
      } else {
        status = HttpStatus.BAD_REQUEST;
        message = 'error.database_query_failed';
        errorKey = 'error.Bad Request';
      }

      this.logger.error(`Database MySQL Error [${errno || code}]: ${exception.message}`, exception.stack);
    } else if (exception instanceof Error) {
      this.logger.error(`Generic Error: ${exception.message}`, exception.stack);
      message = 'error.Generic Error';
    }
    let translatedMessage: string | string[];

    if (Array.isArray(message)) {
      translatedMessage = await Promise.all(message.map((msg) => this.translate(msg, lang, translationArgs)));
    } else {
      translatedMessage = await this.translate(message, lang, translationArgs);
    }

    const translatedError = await this.translate(errorKey, lang);

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: translatedError,
      message: translatedMessage,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(`Critical Exception: ${JSON.stringify(errorResponse)}`);
    else this.logger.warn(`Handled Exception: ${JSON.stringify(errorResponse)}`);

    response.status(status).json(errorResponse);
  }

  private async translate(key: string, lang: string, args?: Record<string, any>): Promise<string> {
    try {
      return await this.i18n.t(key, { lang, args });
    } catch {
      return key;
    }
  }
}
