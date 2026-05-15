import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const Cookie = createParamDecorator((cookieName: string | undefined, ctx: ExecutionContext): string | Record<string, string> | undefined => {
  const request = ctx.switchToHttp().getRequest<Request>();

  const cookies = request.cookies as Record<string, string> | undefined;

  if (!cookies) return undefined;

  if (cookieName) return cookies[cookieName];

  return cookies;
});
