import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { BaseGateway } from '@core/gateways/base.gateway';
import { Language } from '@core/enums';
import { AuthService, IAuthJwtPayload, type IAuthSocket } from '@modules/auth';
import { WsJwtGuard } from '@modules/auth/guards/ws-jwt.guard';
import { UsersService } from '@modules/users';
import { RedisService } from '@shared/redis';
import { AuctionEndDto, AuctionEventDto, AuctionIdDto, AuctionStateDto, NewHighestBidDto, PlaceBidDto } from './dto';
import { BidService } from './bid.service';
import { I18nService } from 'nestjs-i18n';

@WebSocketGateway({
  namespace: '/bid',
})
@UsePipes(new ValidationPipe({ transform: true }))
export class BidGateway extends BaseGateway {
  protected readonly logger = new Logger(BidGateway.name);
  protected readonly namespace = '/bid';

  constructor(
    protected readonly authService: AuthService,
    protected readonly usersService: UsersService,
    protected readonly bidService: BidService,
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

      await this.emitPresenceUpdate(auctionId);
    } catch (error) {
      this.logger.error(`Error during disconnect cleanup for client ${client.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Broadcasts the current unique participant count to all clients in the auction room.
   * Called after every join, leave, and disconnect to keep the presence count in sync.
   *
   * @param auctionId - The ID of the auction room to update.
   */
  private async emitPresenceUpdate(auctionId: number): Promise<void> {
    try {
      const count = await this.redisService.getUniqueParticipantsCount(auctionId);
      this.server.to(`auction_room_${auctionId}`).emit('presence:update', {
        auctionId,
        participantsCount: count,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Error emitting presence update for auction ${auctionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handles request to join a specific auction room.
   * Manages transition between different auction rooms and updates state in Redis.
   */
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

        await this.emitPresenceUpdate(previousAuctionId);
      }

      await client.join(`auction_room_${data.auctionId}`);
      client.data.auctionId = data.auctionId;

      const responsePayload: AuctionEventDto = {
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

      await this.emitPresenceUpdate(data.auctionId);
    } catch (error) {
      this.logger.error(`Error joining auction: ${error instanceof Error ? error.message : String(error)}`);

      client.emit('exception', {
        message: this.i18n.translate('bid.error.join_failed', { lang: client.data.lang }),
        code: 'JOIN_AUCTION_ERROR',
      });
    }
  }

  /**
   * Handles request to leave an auction room.
   */
  @SubscribeMessage('leave:auction')
  async handleLeaveAuction(@MessageBody() data: AuctionIdDto, @ConnectedSocket() client: IAuthSocket) {
    try {
      await client.leave(`auction_room_${data.auctionId}`);
      client.data.auctionId = undefined;

      const responsePayload: AuctionEventDto = {
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

      await this.emitPresenceUpdate(data.auctionId);
    } catch (error) {
      this.logger.error(`Error leaving auction: ${error instanceof Error ? error.message : String(error)}`);

      client.emit('exception', {
        message: this.i18n.translate('bid.error.leave_failed', { lang: client.data.lang }),
        code: 'LEAVE_AUCTION_ERROR',
      });
    }
  }

  /**
   * Handles reconnection after a dropped connection.
   * The client re-authenticates and re-joins the previously active auction room
   * without needing to know the auction ID from UI state alone.
   *
   * @remarks
   * The client must send the `auctionId` it was watching before the disconnect.
   * The handler performs a full validation: auction active check, optional JWT re-auth,
   * and Redis state restoration — identical to a fresh `join:auction` flow.
   * This makes reconnect idempotent and safe to call multiple times.
   */
  @SubscribeMessage('rejoin:auction')
  async handleRejoinAuction(@MessageBody() data: AuctionIdDto, @ConnectedSocket() client: IAuthSocket) {
    try {
      const isActive = await this.redisService.isAuctionActive(data.auctionId);

      if (!isActive) {
        client.emit('auction:ended', {
          auctionId: data.auctionId,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const user = await this.wsJwtGuard.validateOptional(client);
      client.data.user = user ?? undefined;

      await client.join(`auction_room_${data.auctionId}`);
      client.data.auctionId = data.auctionId;

      if (client.data.user) {
        await Promise.all([
          this.redisService.addUserToAuctionRoom(data.auctionId, client.id, client.data.user.sub),
          this.redisService.setSocketAuction(client.data.user.sub, client.id, data.auctionId),
        ]);
      }

      const requestingUserId = client.data.user?.sub;
      const state = await this.bidService.getCurrentState(data.auctionId, requestingUserId);

      client.emit('rejoined:auction', {
        auctionId: data.auctionId,
        ...state,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Client ${client.id} rejoined auction ${data.auctionId} (user: ${client.data.user?.email ?? 'guest'})`);

      if (client.data.user) await this.emitPresenceUpdate(data.auctionId);
    } catch (error) {
      this.logger.error(`Error rejoining auction: ${error instanceof Error ? error.message : String(error)}`);

      client.emit('exception', {
        message: this.i18n.translate('bid.error.join_failed', { lang: client.data.lang }),
        code: 'REJOIN_AUCTION_ERROR',
      });
    }
  }

  /**
   * Handles bid placement.
   * Includes strict JWT re-validation and consistency checks between socket data and Redis.
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('place:bid')
  async handlePlaceBid(@MessageBody() data: PlaceBidDto, @ConnectedSocket() client: IAuthSocket) {
    const lang: Language = client.data.lang;

    const rejectBid = async (code: string, reasonKey: string, extraData = {}) => {
      const reason = await this.i18n.translate(reasonKey, { lang });
      client.emit('bid:rejected', { reason, code, ...extraData });
    };

    try {
      if (!client.data.user) return await rejectBid('UNAUTHORIZED', 'bid.error.unauthorized');

      try {
        await this.wsJwtGuard.revalidateSocket(client);
      } catch {
        await rejectBid('UNAUTHORIZED', 'bid.error.unauthorized');
        client.disconnect();
        return;
      }

      const userId: number = client.data.user.sub;
      const auctionId: number | undefined = client.data.auctionId;

      if (!auctionId) return await rejectBid('NOT_IN_AUCTION_ROOM', 'bid.error.not_in_room');

      const redisAuctionId = await this.redisService.getSocketAuction(userId, client.id);

      if (redisAuctionId !== auctionId) return await rejectBid('NOT_IN_AUCTION_ROOM', 'bid.error.not_in_room');

      const bidResult = await this.bidService.placeBid(auctionId, userId, data.amount, lang);

      if (!bidResult.success) {
        const reason = bidResult.reason || (await this.i18n.translate('bid.error.rejected_too_low', { lang }));

        client.emit('bid:rejected', {
          reason,
          code: bidResult.code || 'BID_TOO_LOW',
          currentPrice: bidResult.currentPrice,
          minNextBid: bidResult.minNextBid,
        });
        return;
      }

      const responsePayload: NewHighestBidDto = {
        auctionId,
        amount: data.amount,
        timestamp: new Date().toISOString(),
      };

      this.server.to(`auction_room_${auctionId}`).emit('new:highest:bid', responsePayload);

      this.logger.log(`New highest bid: auction ${auctionId}, user ${client.data.user.email}, amount ${data.amount}`);
    } catch (error) {
      this.logger.error(`Error placing bid: ${error instanceof Error ? error.message : String(error)}`);
      return await rejectBid('SERVER_ERROR', 'bid.error.place_failed');
    }
  }

  /**
   * Retrieves the current live state of an auction.
   * Protects user privacy by not broadcasting the highest bidder's ID,
   * but instead calculating if the requesting user is the current leader.
   */
  @SubscribeMessage('request:current:state')
  async handleRequestCurrentState(@ConnectedSocket() client: IAuthSocket) {
    try {
      const auctionId: number | undefined = client.data.auctionId;

      if (!auctionId) {
        client.emit('current:state', {
          error: this.i18n.translate('bid.error.not_in_room', { lang: client.data.lang }),
          code: 'NOT_IN_AUCTION_ROOM',
        });
        return;
      }

      const requestingUserId: number | undefined = client.data.user?.sub;

      const state = await this.bidService.getCurrentState(auctionId, requestingUserId);

      const auctionStateDto: AuctionStateDto = {
        auctionId,
        ...state,
        timestamp: new Date().toISOString(),
      };

      client.emit('current:state', auctionStateDto);
    } catch (error) {
      this.logger.error(`Error getting current state: ${error instanceof Error ? error.message : String(error)}`);

      client.emit('current:state', {
        error: this.i18n.translate('bid.error.get_state_failed', { lang: client.data.lang }),
        code: 'GET_STATE_ERROR',
      });
    }
  }

  /**
   * Broadcasts the conclusion of an auction to all connected WebSocket clients.
   * * @remarks
   * This method is typically invoked externally by a BullMQ background worker
   * (`AuctionEndProcessor`) once the auction's state is finalized in the database.
   * * **Privacy by Design:**
   * It intentionally omits the `winnerId` from the public room broadcast to protect
   * the identity of the winning bidder. Instead, it emits a generic 'auction:ended'
   * event with the `finalPrice` to the auction room, and sends a private 'auction:won'
   * event exclusively to the winner's dedicated personal channel (`user:{id}`).
   *
   * @param auctionId - The unique identifier of the auction that has ended.
   * @param winnerId - (Optional) The ID of the winning user, if any bids were placed.
   * @param finalPrice - (Optional) The final closing price of the auction.
   * @returns A promise that resolves when the socket emissions are completed.
   */
  notifyAuctionEnd(auctionId: number, winnerId?: number, finalPrice?: number): void {
    try {
      const auctionEndDto: AuctionEndDto = {
        auctionId,
        finalPrice,
        timestamp: new Date().toISOString(),
      };

      this.server.to(`auction_room_${auctionId}`).emit('auction:ended', auctionEndDto);

      if (winnerId) this.server.to(`user:${winnerId}`).emit('auction:won', auctionEndDto);

      this.logger.log(`Auction ${auctionId} ended — notification sent`);
    } catch (error) {
      this.logger.error(`Error notifying auction end: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
