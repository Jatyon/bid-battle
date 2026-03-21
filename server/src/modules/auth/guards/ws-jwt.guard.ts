import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { IAuthJwt, IAuthJwtPayload, IAuthSocket } from '../interfaces';
import { AuthService } from '../auth.service';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private authService: AuthService,
    private i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<IAuthSocket>();

    if (client.data.user) return true;

    await this.validateClient(client);
    return true;
  }

  async validateClient(client: IAuthSocket): Promise<IAuthJwtPayload> {
    const token = this.extractTokenFromHandshake(client);

    if (!token) throw new WsException(this.i18n.t('auth.errors.no_token'));

    const payload: IAuthJwt = this.verifyToken(token);

    const user = await this.authService.validateJwtUser(payload, this.i18n);

    if (!user) throw new WsException(this.i18n.t('error.Unauthorized'));

    client.data.user = payload;

    return payload;
  }

  async validateOptional(client: IAuthSocket): Promise<IAuthJwtPayload | null> {
    try {
      const token = this.extractTokenFromHandshake(client);

      if (!token) return null;

      const payload: IAuthJwt = this.verifyToken(token);

      const user = await this.authService.validateJwtUser(payload, this.i18n);

      if (!user) return null;

      client.data.user = payload;

      return payload;
    } catch {
      return null;
    }
  }

  private verifyToken(token: string): IAuthJwt {
    try {
      return this.jwtService.verify<IAuthJwt>(token);
    } catch {
      throw new WsException(this.i18n.t('auth.errors.invalid_token'));
    }
  }

  private extractTokenFromHandshake(client: IAuthSocket): string | null {
    const authHeader = client.handshake.headers?.authorization;

    if (authHeader && typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ');
      return type === 'Bearer' ? token : null;
    }

    return null;
  }
}
