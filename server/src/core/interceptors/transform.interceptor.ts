import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  statusCode: number;
  data: T;
  timestamp: string;
  [key: string]: any;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<ExpressResponse>();

    return next.handle().pipe(
      map((res: unknown) => {
        const isObject = typeof res === 'object' && res !== null;
        const hasDataProperty = isObject && 'data' in (res as Record<string, unknown>);

        let finalData = res;
        let meta = {};

        if (hasDataProperty) {
          const objectWithData = res as { data: unknown; [key: string]: unknown };

          const { data, ...rest } = objectWithData;
          finalData = data;
          meta = rest;
        }

        return {
          success: true,
          statusCode: response.statusCode,
          ...meta,
          data: finalData as T,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
