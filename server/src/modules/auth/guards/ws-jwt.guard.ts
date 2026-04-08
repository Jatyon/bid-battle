import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Language } from '@core/enums';
import { IAuthJwt, IAuthJwtPayload, IAuthSocket } from '../interfaces';
import { AuthService } from '../auth.service';
import { I18nService } from 'nestjs-i18n';

/**
 * WebSocket JWT Guard responsible for authenticating socket connections.
 * It supports mandatory authentication, optional identification, and deep re-validation.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private authService: AuthService,
    private i18n: I18nService,
  ) {}

  /**
   * NestJS Guard lifecycle hook. Checks if the current socket event is allowed.
   *
   * @param context - The execution context (WebSocket).
   * @returns True if authentication is successful or already exists in client data.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<IAuthSocket>();

    if (client.data.user) return true;

    await this.validateClient(client);
    return true;
  }

  /**
   * Performs full mandatory authentication for a client.
   * Throws WsException if the token is missing, invalid, or the user no longer exists.
   *
   * @param client - The authenticated socket instance.
   * @returns The decoded JWT payload.
   */
  async validateClient(client: IAuthSocket): Promise<IAuthJwtPayload> {
    const token = this.extractTokenFromHandshake(client);
    const lang: Language = client.data.lang;

    if (!token) throw new WsException(await this.i18n.translate('auth.errors.no_token', { lang }));

    const payload: IAuthJwt = this.verifyToken(token);
    const user = await this.authService.validateJwtUser(payload, this.i18n);

    if (!user) throw new WsException(await this.i18n.translate('error.Unauthorized', { lang }));

    client.data.user = payload;
    return payload;
  }

  /**
   * Attempts to identify the user but does not throw errors if authentication fails.
   * Useful for public rooms where guests are allowed but users should be recognized.
   *
   * @param client - The socket instance.
   * @returns The JWT payload or null if anonymous.
   */
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

  /**
   * Deeply re-validates the JWT token and the user's existence in the database.
   * Essential for sensitive operations (like placing bids) to ensure the session
   * hasn't been revoked (e.g., after a password change) while the socket remained open.
   *
   * @param client - The socket instance to re-validate.
   * @returns The fresh JWT payload.
   * @throws WsException if validation fails.
   */
  async revalidateSocket(client: IAuthSocket): Promise<IAuthJwtPayload> {
    const token = this.extractTokenFromHandshake(client);
    const lang: Language = client.data.lang;

    if (!token) {
      client.data.user = undefined;
      throw new WsException(await this.i18n.translate('auth.errors.no_token', { lang }));
    }

    let payload: IAuthJwt;

    try {
      payload = await this.jwtService.verifyAsync<IAuthJwt>(token);
    } catch {
      client.data.user = undefined;
      throw new WsException(await this.i18n.translate('auth.errors.invalid_token', { lang }));
    }

    const user = await this.authService.validateJwtUser(payload, this.i18n);

    if (!user) {
      client.data.user = undefined;
      throw new WsException(await this.i18n.translate('error.Unauthorized', { lang }));
    }

    client.data.user = payload;
    return payload;
  }

  /**
   * Synchronously verifies the JWT signature and expiration.
   *
   * @param token - The raw JWT string.
   * @returns The decoded payload.
   * @throws WsException if the token is malformed or expired.
   */
  private verifyToken(token: string): IAuthJwt {
    try {
      return this.jwtService.verify<IAuthJwt>(token);
    } catch {
      throw new WsException(this.i18n.t('auth.errors.invalid_token'));
    }
  }

  /**
   * Parses the Authorization header from the WebSocket handshake.
   * Expected format: "Bearer <token>"
   *
   * @param client - The socket client instance.
   * @returns The extracted token string or null.
   */
  private extractTokenFromHandshake(client: IAuthSocket): string | null {
    const authHeader = client.handshake.headers?.authorization;

    if (authHeader && typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ');
      return type === 'Bearer' ? token : null;
    }

    return null;
  }
}
