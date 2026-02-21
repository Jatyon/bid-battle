import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@core/decorators/public.decorator';
import { User } from '@modules/users/entities/user.entity';
import { AuthStrategy } from '../enums';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard(AuthStrategy.JWT) {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);

    if (isPublic) return true;

    return super.canActivate(context);
  }

  handleRequest<TUser = User>(err: Error, user: TUser): TUser {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException({
          statusCode: 401,
          message: 'error.Unauthorized',
          error: 'Unauthorized',
        })
      );
    }

    return user;
  }
}
