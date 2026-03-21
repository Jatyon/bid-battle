import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketServer } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { AuthService, IAuthSocket } from '@modules/auth';
import { UsersService } from '@modules/users';
import { Server, Socket } from 'socket.io';
import { I18nService } from 'nestjs-i18n';

export abstract class BaseGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  protected abstract readonly logger: Logger;
  protected abstract readonly namespace: string;

  constructor(
    protected readonly authService: AuthService,
    protected readonly usersService: UsersService,
    protected readonly appConfigService: AppConfigService,
    protected readonly i18n: I18nService,
  ) {}

  afterInit() {
    this.logger.log(`WebSocket Gateway initialized - Namespace: ${this.namespace}`);
  }

  async handleConnection(client: IAuthSocket) {
    try {
      client.data.lang = this.getLang(client);
      this.setupRateLimit(client);
      await this.onClientConnect(client);
    } catch (error) {
      this.logger.error(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: IAuthSocket) {
    this.onClientDisconnect(client);
  }

  protected abstract onClientConnect(client: IAuthSocket): Promise<void>;

  protected abstract onClientDisconnect(client: IAuthSocket): void;

  private setupRateLimit(client: IAuthSocket) {
    client.data.eventTimestamps = [];

    client.use((packet, next) => {
      const now: number = Date.now();
      const windowStart: number = now - this.appConfigService.socket.windowMs;

      if (client.data.eventTimestamps) {
        client.data.eventTimestamps = client.data.eventTimestamps.filter((timestamp: number) => timestamp > windowStart);

        if (client.data.eventTimestamps.length >= this.appConfigService.socket.maxEvents) {
          this.logger.warn(`Rate limit exceeded for client: ${client.id}`);

          const errorMessage = this.i18n.translate('error.rate_limit_exceeded', { lang: client.data.lang });

          client.emit('exception', {
            message: errorMessage,
            code: 'RATE_LIMIT_EXCEEDED',
          });

          return next(new Error(errorMessage));
        }

        client.data.eventTimestamps.push(now);
      }

      next();
    });
  }

  private getLang(client: Socket): string {
    const lang = client.handshake.headers?.['accept-language']?.trim();

    if (lang && /^[a-zA-Z]{2,3}$/.test(lang)) return lang.toLowerCase();

    return 'en';
  }
}
