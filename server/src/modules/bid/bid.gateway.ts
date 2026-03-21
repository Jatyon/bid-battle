import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { BaseGateway } from '@core/gateways/base.gateway';
import { AuthService, IAuthJwtPayload, type IAuthSocket, WsJwtGuard } from '@modules/auth';
import { UsersService } from '@modules/users';
import { RedisService } from '@shared/redis';
import { auctionEventDto, AuctionIdDto } from './dto';
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
    protected readonly redisService: RedisService,
    protected readonly wsJwtGuard: WsJwtGuard,
  ) {
    super(authService, usersService, appConfigService, i18n);
  }

  protected async onClientConnect(client: IAuthSocket): Promise<void> {
    try {
      const user: IAuthJwtPayload | null = await this.wsJwtGuard.validateOptional(client);

      client.data.user = user ?? undefined;

      if (!user) {
        this.logger.log(`Guest connected: ${client.id}`);
        return;
      }

      await client.join(`user:${user.sub}`);
      this.logger.log(`User connected: ${client.id} - ${user.email}`);
    } catch (error) {
      this.logger.error(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
      client.disconnect();
    }
  }

  protected async onClientDisconnect(client: IAuthSocket): Promise<void> {
    try {
      const user = client.data.user;
      const auctionId = client.data.auctionId;

      if (!auctionId) {
        if (user) this.logger.log(`User disconnected: ${client.id} - ${user.email}`);
        else this.logger.log(`Guest disconnected: ${client.id}`);

        return;
      }

      if (!user) {
        this.logger.log(`Guest disconnected: ${client.id} (Left auction ${auctionId})`);
        return;
      }

      await Promise.all([this.redisService.removeUserFromAuctionRoom(auctionId, client.id), this.redisService.deleteSocketAuction(user.sub, client.id)]);
      this.logger.log(`User disconnected: ${client.id} - ${user.email} (Removed from auction ${auctionId})`);
    } catch (error) {
      this.logger.error(`Error during disconnect cleanup for client ${client.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  @SubscribeMessage('join:auction')
  async handleJoinAuction(@MessageBody() data: AuctionIdDto, @ConnectedSocket() client: IAuthSocket) {
    try {
      const isActive = await this.redisService.isAuctionActive(data.auctionId);

      if (!isActive) {
        client.emit('exception', {
          message: this.i18n.translate('bid.error.auction_ended', { lang: client.data.lang }),
          code: 'AUCTION_NOT_ACTIVE',
        });
        return;
      }

      const previousAuctionId: number | undefined = client.data.auctionId;

      if (previousAuctionId != null && previousAuctionId !== data.auctionId) {
        await client.leave(`auction_room_${previousAuctionId}`);

        if (client.data.user) {
          await Promise.all([this.redisService.removeUserFromAuctionRoom(previousAuctionId, client.id), this.redisService.deleteSocketAuction(client.data.user.sub, client.id)]);
        }
      }

      await client.join(`auction_room_${data.auctionId}`);
      client.data.auctionId = data.auctionId;

      const responsePayload: auctionEventDto = {
        auctionId: data.auctionId,
        timestamp: new Date().toISOString(),
      };

      if (!client.data.user) {
        this.logger.log(`Guest ${client.id} joined auction ${data.auctionId}`);
        client.emit('joined:auction', responsePayload);
        return;
      }

      await Promise.all([
        this.redisService.addUserToAuctionRoom(data.auctionId, client.id, client.data.user.sub),
        this.redisService.setSocketAuction(client.data.user.sub, client.id, data.auctionId),
      ]);

      this.logger.log(`User ${client.data.user.email} (Socket: ${client.id}) joined auction ${data.auctionId}`);

      client.emit('joined:auction', responsePayload);
    } catch (error) {
      this.logger.error(`Error joining auction: ${error instanceof Error ? error.message : String(error)}`);

      client.emit('exception', {
        message: this.i18n.translate('bid.error.join_failed', { lang: client.data.lang }),
        code: 'JOIN_AUCTION_ERROR',
      });
    }
  }

  @SubscribeMessage('leave:auction')
  async handleLeaveAuction(@MessageBody() data: AuctionIdDto, @ConnectedSocket() client: IAuthSocket) {
    try {
      await client.leave(`auction_room_${data.auctionId}`);
      client.data.auctionId = undefined;

      const responsePayload: auctionEventDto = {
        auctionId: data.auctionId,
        timestamp: new Date().toISOString(),
      };

      if (!client.data.user) {
        this.logger.log(`Guest ${client.id} left auction ${data.auctionId}`);
        client.emit('left:auction', responsePayload);
        return;
      }

      await Promise.all([this.redisService.removeUserFromAuctionRoom(data.auctionId, client.id), this.redisService.deleteSocketAuction(client.data.user.sub, client.id)]);

      this.logger.log(`User ${client.data.user.email} (Socket: ${client.id}) left auction ${data.auctionId}`);

      client.emit('left:auction', responsePayload);
    } catch (error) {
      this.logger.error(`Error leaving auction: ${error instanceof Error ? error.message : String(error)}`);

      client.emit('exception', {
        message: this.i18n.translate('bid.error.leave_failed', { lang: client.data.lang }),
        code: 'LEAVE_AUCTION_ERROR',
      });
    }
  }
}
