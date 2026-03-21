import { WebSocketGateway } from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { BaseGateway } from '@core/gateways/base.gateway';
import { AuthService, IAuthJwtPayload, IAuthSocket, WsJwtGuard } from '@modules/auth';
import { UsersService } from '@modules/users';
import { I18nService } from 'nestjs-i18n';

@WebSocketGateway({
  namespace: '/bid',
  cors: { credentials: true },
})
@UsePipes(new ValidationPipe({ transform: true }))
export class BidGateway extends BaseGateway {
  protected readonly logger = new Logger(BidGateway.name);
  protected readonly namespace = '/bid';

  constructor(
    protected readonly authService: AuthService,
    protected readonly usersService: UsersService,
    protected readonly i18n: I18nService,
    protected readonly appConfigService: AppConfigService,
    protected readonly wsJwtGuard: WsJwtGuard,
  ) {
    super(authService, usersService, appConfigService, i18n);
  }

  protected async onClientConnect(client: IAuthSocket): Promise<void> {
    try {
      const user: IAuthJwtPayload | null = await this.wsJwtGuard.validateOptional(client);

      client.data.user = user ?? undefined;

      if (user) {
        await client.join(`user:${user.sub}`);
        this.logger.log(`User connected: ${client.id} - ${user.email}`);
      } else {
        this.logger.log(`Guest connected: ${client.id}`);
      }
    } catch (error) {
      this.logger.error(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
      client.disconnect();
    }
  }

  protected onClientDisconnect(client: IAuthSocket): void {
    const user = client.data.user as IAuthJwtPayload | null;

    if (!user) {
      this.logger.log(`Guest disconnected: ${client.id}`);
      return;
    }

    this.logger.log(`User disconnected: ${client.id} - ${user.email}`);
  }
}
