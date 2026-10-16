import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Logger, OnModuleDestroy, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { BaseGateway } from '@core/gateways/base.gateway';
import { Language } from '@core/enums';
import { AuthService, IAuthJwtPayload, type IAuthSocket } from '@modules/auth';
import { WsJwtGuard } from '@modules/auth/guards/ws-jwt.guard';
import { UsersService } from '@modules/users';
import { RedisService } from '@shared/redis';
import { AuctionEndDto, AuctionEventDto, AuctionIdDto, AuctionOutbidDto, AuctionStateDto, NewHighestBidDto, PlaceBidDto, BidResponse } from './dto';
import { BidSocketEvent } from './enums';
import { BidService } from './bid.service';
import { I18nService } from 'nestjs-i18n';

@WebSocketGateway({
  namespace: '/bid',
})
@UsePipes(new ValidationPipe({ transform: true }))
export class BidGateway extends BaseGateway implements OnModuleDestroy {
  protected readonly logger = new Logger(BidGateway.name);
  protected readonly namespace = '/bid';

  private static readonly PRESENCE_UPDATE_INTERVAL_MS = 5000;
  private readonly pendingPresenceUpdates = new Set<number>();
  private presenceInterval: NodeJS.Timeout | null = null;

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
        await this.redisService.removeUserFromAuctionRoom(auctionId, client.id);
        this.schedulePresenceUpdate(auctionId);
        return;
      }

      await Promise.all([this.redisService.removeUserFromAuctionRoom(auctionId, client.id), this.redisService.deleteSocketAuction(user.sub, client.id)]);
      this.logger.log(`User disconnected: ${client.id} - ${user.email} (Removed from auction ${auctionId})`);

      this.schedulePresenceUpdate(auctionId);
    } catch (error) {
      this.logger.error(`Error during disconnect cleanup for client ${client.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  override afterInit(): void {
    super.afterInit();
    this.startPresenceInterval();
  }

  onModuleDestroy(): void {
    this.stopPresenceInterval();
  }

  /**
   * Starts the cyclic presence interval if not already running.
   */
  startPresenceInterval(): void {
    if (!this.presenceInterval) {
      this.presenceInterval = setInterval(() => {
        void this.flushPresenceUpdates();
      }, BidGateway.PRESENCE_UPDATE_INTERVAL_MS);
    }
  }

  /**
   * Stops the presence interval (e.g. during module destroy or tests).
   */
  stopPresenceInterval(): void {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
  }

  /**
   * Schedules a throttled presence update for the given auction.
   * Rather than broadcasting on every single connect/disconnect event,
   * auction IDs are collected in a Set and emitted in batches cyclically.
   *
   * @param auctionId - The ID of the auction room to update.
   */
  schedulePresenceUpdate(auctionId: number): void {
    this.pendingPresenceUpdates.add(auctionId);
  }

  /**
   * Flushes all pending presence updates by querying Redis and broadcasting to each room.
   */
  async flushPresenceUpdates(): Promise<void> {
    if (this.pendingPresenceUpdates.size === 0) return;

    const auctionIds = Array.from(this.pendingPresenceUpdates);
    this.pendingPresenceUpdates.clear();

    await Promise.allSettled(auctionIds.map((auctionId) => this.emitPresenceUpdate(auctionId)));
  }

  /**
   * Broadcasts the current unique participant count to all clients in the auction room.
   *
   * @param auctionId - The ID of the auction room to update.
   */
  async emitPresenceUpdate(auctionId: number): Promise<void> {
    try {
      if (!this.server) {
        return;
      }
      const count = await this.redisService.getUniqueParticipantsCount(auctionId);
      this.server.to(`auction_room_${auctionId}`).emit(BidSocketEvent.PRESENCE_UPDATE, {
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
  @SubscribeMessage(BidSocketEvent.JOIN_AUCTION)
  async handleJoinAuction(@MessageBody() data: AuctionIdDto, @ConnectedSocket() client: IAuthSocket) {
    try {
      const isActive = await this.redisService.isAuctionActive(data.auctionId);

      if (!isActive) {
        client.emit(BidSocketEvent.AUCTION_ENDED, {
          auctionId: data.auctionId,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const previousAuctionId: number | undefined = client.data.auctionId;

      if (previousAuctionId != null && previousAuctionId !== data.auctionId) {
        await client.leave(`auction_room_${previousAuctionId}`);

        if (client.data.user) {
          await Promise.all([this.redisService.removeUserFromAuctionRoom(previousAuctionId, client.id), this.redisService.deleteSocketAuction(client.data.user.sub, client.id)]);
        } else {
          await this.redisService.removeUserFromAuctionRoom(previousAuctionId, client.id);
        }

        this.schedulePresenceUpdate(previousAuctionId);
      }

      await client.join(`auction_room_${data.auctionId}`);
      client.data.auctionId = data.auctionId;

      const responsePayload: AuctionEventDto = {
        auctionId: data.auctionId,
        timestamp: new Date().toISOString(),
      };

      if (!client.data.user) {
        this.logger.log(`Guest ${client.id} joined auction ${data.auctionId}`);
        await this.redisService.addUserToAuctionRoom(data.auctionId, client.id, client.id);
        client.emit(BidSocketEvent.JOINED_AUCTION, responsePayload);
        this.schedulePresenceUpdate(data.auctionId);
        return;
      }

      await Promise.all([
        this.redisService.addUserToAuctionRoom(data.auctionId, client.id, client.data.user.sub),
        this.redisService.setSocketAuction(client.data.user.sub, client.id, data.auctionId),
      ]);

      this.logger.log(`User ${client.data.user.email} (Socket: ${client.id}) joined auction ${data.auctionId}`);

      client.emit(BidSocketEvent.JOINED_AUCTION, responsePayload);

      this.schedulePresenceUpdate(data.auctionId);
    } catch (error) {
      this.logger.error(`Error joining auction: ${error instanceof Error ? error.message : String(error)}`);

      client.emit(BidSocketEvent.EXCEPTION, {
        message: this.i18n.translate('bid.error.join_failed', { lang: client.data.lang }),
        code: 'JOIN_AUCTION_ERROR',
      });
    }
  }

  /**
   * Handles request to leave an auction room.
   */
  @SubscribeMessage(BidSocketEvent.LEAVE_AUCTION)
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
        await this.redisService.removeUserFromAuctionRoom(data.auctionId, client.id);
        client.emit(BidSocketEvent.LEFT_AUCTION, responsePayload);
        this.schedulePresenceUpdate(data.auctionId);
        return;
      }

      await Promise.all([this.redisService.removeUserFromAuctionRoom(data.auctionId, client.id), this.redisService.deleteSocketAuction(client.data.user.sub, client.id)]);

      this.logger.log(`User ${client.data.user.email} (Socket: ${client.id}) left auction ${data.auctionId}`);

      client.emit(BidSocketEvent.LEFT_AUCTION, responsePayload);

      this.schedulePresenceUpdate(data.auctionId);
    } catch (error) {
      this.logger.error(`Error leaving auction: ${error instanceof Error ? error.message : String(error)}`);

      client.emit(BidSocketEvent.EXCEPTION, {
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
  @SubscribeMessage(BidSocketEvent.REJOIN_AUCTION)
  async handleRejoinAuction(@MessageBody() data: AuctionIdDto, @ConnectedSocket() client: IAuthSocket) {
    try {
      const isActive = await this.redisService.isAuctionActive(data.auctionId);

      if (!isActive) {
        client.emit(BidSocketEvent.AUCTION_ENDED, {
          auctionId: data.auctionId,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const user = await this.wsJwtGuard.validateOptional(client);
      client.data.user = user ?? undefined;

      // Leave previous room if the client is rejoining a different auction.
      // Without this, the socket would end up in two rooms simultaneously
      // with stale presence data in the old room.
      const previousAuctionId: number | undefined = client.data.auctionId;

      if (previousAuctionId != null && previousAuctionId !== data.auctionId) {
        await client.leave(`auction_room_${previousAuctionId}`);

        if (client.data.user) {
          await Promise.all([this.redisService.removeUserFromAuctionRoom(previousAuctionId, client.id), this.redisService.deleteSocketAuction(client.data.user.sub, client.id)]);
        } else {
          await this.redisService.removeUserFromAuctionRoom(previousAuctionId, client.id);
        }

        this.schedulePresenceUpdate(previousAuctionId);
      }

      await client.join(`auction_room_${data.auctionId}`);
      client.data.auctionId = data.auctionId;

      if (client.data.user) {
        await Promise.all([
          this.redisService.addUserToAuctionRoom(data.auctionId, client.id, client.data.user.sub),
          this.redisService.setSocketAuction(client.data.user.sub, client.id, data.auctionId),
        ]);
      } else {
        await this.redisService.addUserToAuctionRoom(data.auctionId, client.id, client.id);
      }

      const requestingUserId = client.data.user?.sub;
      const state = await this.bidService.getCurrentState(data.auctionId, requestingUserId);

      client.emit(BidSocketEvent.REJOINED_AUCTION, {
        auctionId: data.auctionId,
        ...state,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Client ${client.id} rejoined auction ${data.auctionId} (user: ${client.data.user?.email ?? 'guest'})`);

      this.schedulePresenceUpdate(data.auctionId);
    } catch (error) {
      this.logger.error(`Error rejoining auction: ${error instanceof Error ? error.message : String(error)}`);

      client.emit(BidSocketEvent.EXCEPTION, {
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
  @SubscribeMessage(BidSocketEvent.PLACE_BID)
  async handlePlaceBid(@MessageBody() data: PlaceBidDto, @ConnectedSocket() client: IAuthSocket) {
    const lang: Language = client.data.lang;

    const rejectBid = async (code: string, reasonKey: string, extraData = {}) => {
      const reason = await this.i18n.translate(reasonKey, { lang });
      client.emit(BidSocketEvent.BID_REJECTED, { reason, code, ...extraData });
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

        client.emit(BidSocketEvent.BID_REJECTED, {
          reason,
          code: bidResult.code || 'BID_TOO_LOW',
          currentPrice: bidResult.currentPrice,
          minNextBid: bidResult.minNextBid,
        });
        return;
      }

      const publicPayload: NewHighestBidDto = {
        auctionId,
        amount: data.amount,
        timestamp: new Date().toISOString(),
        bid: bidResult.bid ? new BidResponse(bidResult.bid, true, undefined) : undefined,
      };

      const privatePayload: NewHighestBidDto = {
        auctionId,
        amount: data.amount,
        timestamp: new Date().toISOString(),
        bid: bidResult.bid ? new BidResponse(bidResult.bid, true, userId) : undefined,
      };

      // Broadcast to everyone else in the room (ID is masked), excluding the user's personal channel
      client.broadcast.to(`auction_room_${auctionId}`).except(`user:${userId}`).emit(BidSocketEvent.NEW_HIGHEST_BID, publicPayload);

      // Emit strictly to the user who placed the bid across all their tabs (ID is preserved so frontend detects isMyBid)
      this.server.to(`user:${userId}`).emit(BidSocketEvent.NEW_HIGHEST_BID, privatePayload);

      // Notify previous leader if their bid was outbid
      const previousBidderId = bidResult.previousBidderId;
      if (previousBidderId && previousBidderId !== userId) {
        const outbidPayload: AuctionOutbidDto = {
          auctionId,
          newAmount: data.amount,
          auctionTitle: bidResult.bid?.auction?.title,
          timestamp: new Date().toISOString(),
        };

        // 1. Emit instant WebSocket event to the previous leader's personal room
        this.server.to(`user:${previousBidderId}`).emit(BidSocketEvent.AUCTION_OUTBID, outbidPayload);

        // 2. Queue email notification asynchronously via BidService respecting user preferences and rate limit
        this.bidService
          .handleOutbidEmailNotification(auctionId, previousBidderId, data.amount, bidResult.bid?.auction?.title)
          .catch((err) => this.logger.error(`Failed to handle outbid email notification: ${err instanceof Error ? err.message : String(err)}`));
      }

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
  @SubscribeMessage(BidSocketEvent.REQUEST_CURRENT_STATE)
  async handleRequestCurrentState(@ConnectedSocket() client: IAuthSocket) {
    try {
      const auctionId: number | undefined = client.data.auctionId;

      if (!auctionId) {
        client.emit(BidSocketEvent.EXCEPTION, {
          message: this.i18n.translate('bid.error.not_in_room', { lang: client.data.lang }),
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

      client.emit(BidSocketEvent.CURRENT_STATE, auctionStateDto);
    } catch (error) {
      this.logger.error(`Error getting current state: ${error instanceof Error ? error.message : String(error)}`);

      client.emit(BidSocketEvent.EXCEPTION, {
        message: this.i18n.translate('bid.error.get_state_failed', { lang: client.data.lang }),
        code: 'GET_STATE_ERROR',
      });
    }
  }

  /**
   * Broadcasts the conclusion of an auction to all connected WebSocket clients.
   * * @remarks
   * This method is typically invoked externally by a BullMQ background worker
   * (`AuctionEndProcessor`) once the auction's state is finalized in the database.
   * * **Ordering guarantee:**
   * Redis is cleaned up **before** any socket event is emitted. This ensures that
   * by the time clients receive `auction:ended`, `isAuctionActive` already returns
   * `false` — closing the race window where a bid could be accepted after the
   * auction officially ended.
   * * **Privacy by Design:**
   * It intentionally omits the `winnerId` from the public room broadcast to protect
   * the identity of the winning bidder. Instead, it emits a generic 'auction:ended'
   * event with the `finalPrice` to the auction room, and sends a private 'auction:won'
   * event exclusively to the winner's dedicated personal channel (`user:{id}`).
   *
   * @param auctionId - The unique identifier of the auction that has ended.
   * @param winnerId - (Optional) The ID of the winning user, if any bids were placed.
   * @param finalPrice - (Optional) The final closing price of the auction.
   * @returns A promise that resolves when Redis cleanup and socket emissions are completed.
   */
  async notifyAuctionEnd(auctionId: number, winnerId?: number, finalPrice?: number): Promise<void> {
    try {
      this.pendingPresenceUpdates.delete(auctionId);

      // Clean up Redis first so no new bids can be placed after the socket events are sent.
      // This is idempotent — safe to call even if AuctionEndProcessor already ran cleanupAuction.
      await this.redisService.cleanupAuction(auctionId);

      const auctionEndDto: AuctionEndDto = {
        auctionId,
        finalPrice,
        timestamp: new Date().toISOString(),
      };

      this.server.to(`auction_room_${auctionId}`).emit(BidSocketEvent.AUCTION_ENDED, auctionEndDto);

      if (winnerId) this.server.to(`user:${winnerId}`).emit(BidSocketEvent.AUCTION_WON, auctionEndDto);

      this.logger.log(`Auction ${auctionId} ended — notification sent`);
    } catch (error) {
      this.logger.error(`Error notifying auction end: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
