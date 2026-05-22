import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthStrategy } from '../enums/auth-strategy.enum';
interface IOAuthRequest {
  authError?: unknown;
}

/**
 * Guard for Google OAuth callback.
 *
 * We override `handleRequest` so that validation errors (e.g. unverified email)
 * do not throw an HTTP exception at this level – instead, we pass it further
 * to the controller, which will redirect to the frontend with the appropriate message.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard(AuthStrategy.GOOGLE) {
  handleRequest<T>(err: Error | null, user: T): T {
    if (err || !user) throw err ?? new Error('OAuth authentication failed');

    return user;
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return (await super.canActivate(context)) as boolean;
    } catch (err: unknown) {
      const request = context.switchToHttp().getRequest<IOAuthRequest>();

      request.authError = err;
      return true;
    }
  }
}
