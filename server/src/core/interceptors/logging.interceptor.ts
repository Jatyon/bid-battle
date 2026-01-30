import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
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
        error: (error: Error) => {
          const delay = Date.now() - now;
          this.logger.error(`${method} ${url} - ${error.message} - ${delay}ms`);
        },
      }),
    );
  }
}
