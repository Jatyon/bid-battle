import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger, HttpException } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { translateForLog } from '@core/utils/i18n-log.util';
import { Request, Response } from 'express';
import { I18nService } from 'nestjs-i18n';
import { Observable, tap } from 'rxjs';

interface ExceptionResponseBody {
  message?: string | string[];
  args?: Record<string, unknown>;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(
    private readonly i18n: I18nService,
    private readonly configService: AppConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    const { method, url, ip } = request;

    if (url === '/health') return next.handle();

    const userAgent = request.get('user-agent') || '';
    const now = Date.now();

    this.logger.log(`${method} ${url} - User Agent: ${userAgent} IP: ${ip} - Started`);

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<Response>();
          const { statusCode } = response;
          const delay = Date.now() - now;

          this.logger.log(`${method} ${url} ${statusCode} - ${delay}ms`);
        },
        error: (error: unknown) => {
          const delay = Date.now() - now;
          const logText = this.resolveErrorLogMessage(error);
          this.logger.error(`${method} ${url} - ${logText} - ${delay}ms`);
        },
      }),
    );
  }

  private resolveErrorLogMessage(error: unknown): string {
    if (!(error instanceof HttpException)) return error instanceof Error ? error.message : 'Unknown error';

    const response = error.getResponse();

    if (typeof response === 'string') return translateForLog(this.i18n, this.configService, response);

    if (typeof response === 'object' && response !== null) {
      const body = response as ExceptionResponseBody;
      const raw = Array.isArray(body.message) ? body.message[0] : body.message;

      if (raw) return translateForLog(this.i18n, this.configService, raw, body.args);
    }

    return `HTTP ${error.getStatus()}`;
  }
}
