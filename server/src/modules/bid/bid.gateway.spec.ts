import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import { AppConfigService } from '@config/config.service';
import { Language } from '@core/enums';
import { createMockI18nService } from '@test/mocks/i18n.mock';
import { AuthService, IAuthJwtPayload, IAuthSocket } from '@modules/auth';
import { WsJwtGuard } from '@modules/auth/guards/ws-jwt.guard';
import { UsersService } from '@modules/users';
import { RedisService } from '@shared/redis';
import { IAuctionState, IBidResult } from './interfaces';
import { AuctionIdDto, PlaceBidDto } from './dto';
import { BidGateway } from './bid.gateway';
import { BidService } from './bid.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';

const createMockClient = (overrides: Partial<IAuthSocket['data']> = {}): DeepMocked<IAuthSocket> => {
  const client = createMock<IAuthSocket>();
  Object.defineProperty(client, 'id', { value: 'socket-test-id', writable: true });
  client.data = { lang: Language.EN, ...overrides };
  return client;
};

const mockUser: IAuthJwtPayload = { sub: 1, email: 'user@test.com' };

describe('BidGateway', () => {
  let gateway: BidGateway;
  let bidService: DeepMocked<BidService>;
  let redisService: DeepMocked<RedisService>;
  let wsJwtGuard: DeepMocked<WsJwtGuard>;

  beforeEach(async () => {
    const mockWsJwtGuard = createMock<WsJwtGuard>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BidGateway,
        { provide: BidService, useValue: createMock<BidService>() },
        { provide: RedisService, useValue: createMock<RedisService>() },
        { provide: WsJwtGuard, useValue: mockWsJwtGuard },
        { provide: AuthService, useValue: createMock<AuthService>() },
        { provide: UsersService, useValue: createMock<UsersService>() },
        { provide: AppConfigService, useValue: createMock<AppConfigService>() },
        { provide: I18nService, useValue: createMockI18nService() },
        { provide: JwtService, useValue: createMock<JwtService>() },
      ],
    })
      .overrideGuard(WsJwtGuard)
      .useValue(mockWsJwtGuard)
      .compile();

    gateway = module.get<BidGateway>(BidGateway);
    bidService = module.get(BidService);
    redisService = module.get(RedisService);
    wsJwtGuard = module.get(WsJwtGuard);

    gateway.server = createMock();

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('onClientConnect', () => {
    it('should set user data and join personal room when JWT is valid', async () => {
      const client = createMockClient();
      wsJwtGuard.validateOptional.mockResolvedValue(mockUser);

      await gateway['onClientConnect'](client);

      expect(client.data.user).toBe(mockUser);
      expect(client.join).toHaveBeenCalledWith(`user:${mockUser.sub}`);
    });

    it('should set user to undefined and log guest when JWT is absent', async () => {
      const client = createMockClient();
      wsJwtGuard.validateOptional.mockResolvedValue(null);

      await gateway['onClientConnect'](client);

      expect(client.data.user).toBeUndefined();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should disconnect client and log error when validateOptional throws', async () => {
      const client = createMockClient();
      wsJwtGuard.validateOptional.mockRejectedValue(new Error('JWT error'));

      await gateway['onClientConnect'](client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe('onClientDisconnect', () => {
    it('should do nothing and log when client has no auctionId', async () => {
      const client = createMockClient({ user: mockUser });

      await gateway['onClientDisconnect'](client);

      expect(redisService.removeUserFromAuctionRoom).not.toHaveBeenCalled();
      expect(redisService.deleteSocketAuction).not.toHaveBeenCalled();
    });

    it('should log guest disconnect when client has no user and no auctionId', async () => {
      const client = createMockClient();

      await gateway['onClientDisconnect'](client);

      expect(redisService.removeUserFromAuctionRoom).not.toHaveBeenCalled();
    });

    it('should clean up Redis when authenticated user disconnects from an auction room', async () => {
      const client = createMockClient({ user: mockUser, auctionId: 5 });
      redisService.removeUserFromAuctionRoom.mockResolvedValue(undefined);
      redisService.deleteSocketAuction.mockResolvedValue(undefined);

      await gateway['onClientDisconnect'](client);

      expect(redisService.removeUserFromAuctionRoom).toHaveBeenCalledWith(5, client.id);
      expect(redisService.deleteSocketAuction).toHaveBeenCalledWith(mockUser.sub, client.id);
    });

    it('should skip Redis cleanup and log when guest disconnects from an auction room', async () => {
      const client = createMockClient({ auctionId: 5 });

      await gateway['onClientDisconnect'](client);

      expect(redisService.removeUserFromAuctionRoom).not.toHaveBeenCalled();
    });

    it('should log error and not throw when Redis cleanup fails', async () => {
      const client = createMockClient({ user: mockUser, auctionId: 5 });
      redisService.removeUserFromAuctionRoom.mockRejectedValue(new Error('Redis error'));

      await expect(gateway['onClientDisconnect'](client)).resolves.not.toThrow();

      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe('handleJoinAuction', () => {
    const data: AuctionIdDto = { auctionId: 10 };

    it('should emit exception when auction is not active', async () => {
      const client = createMockClient({ user: mockUser });
      redisService.isAuctionActive.mockResolvedValue(false);

      await gateway.handleJoinAuction(data, client);

      expect(client.emit).toHaveBeenCalledWith('exception', expect.objectContaining({ code: 'AUCTION_NOT_ACTIVE' }));
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should join auction room and emit joined:auction for a guest', async () => {
      const client = createMockClient();
      redisService.isAuctionActive.mockResolvedValue(true);

      await gateway.handleJoinAuction(data, client);

      expect(client.join).toHaveBeenCalledWith('auction_room_10');
      expect(client.data.auctionId).toBe(10);
      expect(client.emit).toHaveBeenCalledWith('joined:auction', expect.objectContaining({ auctionId: 10 }));
      expect(redisService.addUserToAuctionRoom).not.toHaveBeenCalled();
    });

    it('should join room, register in Redis, and emit joined:auction for authenticated user', async () => {
      const client = createMockClient({ user: mockUser });
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.addUserToAuctionRoom.mockResolvedValue(undefined);
      redisService.setSocketAuction.mockResolvedValue(undefined);

      await gateway.handleJoinAuction(data, client);

      expect(client.join).toHaveBeenCalledWith('auction_room_10');
      expect(redisService.addUserToAuctionRoom).toHaveBeenCalledWith(10, client.id, mockUser.sub);
      expect(redisService.setSocketAuction).toHaveBeenCalledWith(mockUser.sub, client.id, 10);
      expect(client.emit).toHaveBeenCalledWith('joined:auction', expect.objectContaining({ auctionId: 10 }));
    });

    it('should leave previous room and clean up Redis before joining new auction', async () => {
      const client = createMockClient({ user: mockUser, auctionId: 7 });
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.removeUserFromAuctionRoom.mockResolvedValue(undefined);
      redisService.deleteSocketAuction.mockResolvedValue(undefined);
      redisService.addUserToAuctionRoom.mockResolvedValue(undefined);
      redisService.setSocketAuction.mockResolvedValue(undefined);

      await gateway.handleJoinAuction(data, client);

      expect(client.leave).toHaveBeenCalledWith('auction_room_7');
      expect(redisService.removeUserFromAuctionRoom).toHaveBeenCalledWith(7, client.id);
      expect(redisService.deleteSocketAuction).toHaveBeenCalledWith(mockUser.sub, client.id);
    });

    it('should not leave previous room when joining the same auction again', async () => {
      const client = createMockClient({ user: mockUser, auctionId: 10 });
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.addUserToAuctionRoom.mockResolvedValue(undefined);
      redisService.setSocketAuction.mockResolvedValue(undefined);

      await gateway.handleJoinAuction(data, client);

      expect(client.leave).not.toHaveBeenCalled();
    });

    it('should emit exception and log error when an unexpected error occurs', async () => {
      const client = createMockClient({ user: mockUser });
      redisService.isAuctionActive.mockRejectedValue(new Error('Redis error'));

      await gateway.handleJoinAuction(data, client);

      expect(client.emit).toHaveBeenCalledWith('exception', expect.objectContaining({ code: 'JOIN_AUCTION_ERROR' }));
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe('handleLeaveAuction', () => {
    const data: AuctionIdDto = { auctionId: 10 };

    it('should log error and not throw when emitPresenceUpdate fails inside handleLeaveAuction', async () => {
      const client = createMockClient({ user: mockUser });
      redisService.removeUserFromAuctionRoom.mockResolvedValue(undefined);
      redisService.deleteSocketAuction.mockResolvedValue(undefined);
      redisService.getUniqueParticipantsCount.mockRejectedValue(new Error('Redis error'));

      await expect(gateway.handleLeaveAuction(data, client)).resolves.not.toThrow();
    });

    it('should leave room, emit left:auction, and clean Redis for authenticated user', async () => {
      const client = createMockClient({ user: mockUser });
      redisService.removeUserFromAuctionRoom.mockResolvedValue(undefined);
      redisService.deleteSocketAuction.mockResolvedValue(undefined);

      await gateway.handleLeaveAuction(data, client);

      expect(client.leave).toHaveBeenCalledWith('auction_room_10');
      expect(client.data.auctionId).toBeUndefined();
      expect(redisService.removeUserFromAuctionRoom).toHaveBeenCalledWith(10, client.id);
      expect(redisService.deleteSocketAuction).toHaveBeenCalledWith(mockUser.sub, client.id);
      expect(client.emit).toHaveBeenCalledWith('left:auction', expect.objectContaining({ auctionId: 10 }));
    });

    it('should leave room and emit left:auction for guest without touching Redis', async () => {
      const client = createMockClient();

      await gateway.handleLeaveAuction(data, client);

      expect(client.leave).toHaveBeenCalledWith('auction_room_10');
      expect(redisService.removeUserFromAuctionRoom).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('left:auction', expect.objectContaining({ auctionId: 10 }));
    });

    it('should emit exception when an unexpected error occurs', async () => {
      const client = createMockClient({ user: mockUser });
      redisService.removeUserFromAuctionRoom.mockRejectedValue(new Error('Redis error'));

      await gateway.handleLeaveAuction(data, client);

      expect(client.emit).toHaveBeenCalledWith('exception', expect.objectContaining({ code: 'LEAVE_AUCTION_ERROR' }));
    });
  });

  describe('handleRejoinAuction', () => {
    const data: AuctionIdDto = { auctionId: 10 };

    it('should emit auction:ended when auction is not active', async () => {
      const client = createMockClient({ user: mockUser });
      redisService.isAuctionActive.mockResolvedValue(false);

      await gateway.handleRejoinAuction(data, client);

      expect(client.emit).toHaveBeenCalledWith('auction:ended', expect.objectContaining({ auctionId: 10 }));
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should join room, emit rejoined:auction and restore Redis state for authenticated user', async () => {
      const client = createMockClient();
      redisService.isAuctionActive.mockResolvedValue(true);
      wsJwtGuard.validateOptional.mockResolvedValue(mockUser);
      redisService.addUserToAuctionRoom.mockResolvedValue(undefined);
      redisService.setSocketAuction.mockResolvedValue(undefined);
      redisService.getUniqueParticipantsCount.mockResolvedValue(2);
      bidService.getCurrentState.mockResolvedValue({ currentPrice: 100, isLeading: false, isActive: true, participantsCount: 2 });

      await gateway.handleRejoinAuction(data, client);

      expect(client.join).toHaveBeenCalledWith('auction_room_10');
      expect(client.data.auctionId).toBe(10);
      expect(redisService.addUserToAuctionRoom).toHaveBeenCalledWith(10, client.id, mockUser.sub);
      expect(redisService.setSocketAuction).toHaveBeenCalledWith(mockUser.sub, client.id, 10);
      expect(client.emit).toHaveBeenCalledWith('rejoined:auction', expect.objectContaining({ auctionId: 10 }));
    });

    it('should join room and emit rejoined:auction for guest (no Redis state update)', async () => {
      const client = createMockClient();
      redisService.isAuctionActive.mockResolvedValue(true);
      wsJwtGuard.validateOptional.mockResolvedValue(null);
      bidService.getCurrentState.mockResolvedValue({ currentPrice: 100, isLeading: false, isActive: true, participantsCount: 0 });

      await gateway.handleRejoinAuction(data, client);

      expect(client.join).toHaveBeenCalledWith('auction_room_10');
      expect(redisService.addUserToAuctionRoom).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('rejoined:auction', expect.objectContaining({ auctionId: 10 }));
    });

    it('should emit exception with REJOIN_AUCTION_ERROR when an unexpected error occurs', async () => {
      const client = createMockClient();
      redisService.isAuctionActive.mockRejectedValue(new Error('Redis error'));

      await gateway.handleRejoinAuction(data, client);

      expect(client.emit).toHaveBeenCalledWith('exception', expect.objectContaining({ code: 'REJOIN_AUCTION_ERROR' }));
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe('handlePlaceBid', () => {
    const data: PlaceBidDto = { amount: 500 };

    it('should emit bid:rejected with UNAUTHORIZED when user is not set', async () => {
      const client = createMockClient();

      await gateway.handlePlaceBid(data, client);

      expect(client.emit).toHaveBeenCalledWith('bid:rejected', expect.objectContaining({ code: 'UNAUTHORIZED' }));
      expect(bidService.placeBid).not.toHaveBeenCalled();
    });

    it('should emit bid:rejected and disconnect when JWT re-validation fails', async () => {
      const client = createMockClient({ user: mockUser });
      wsJwtGuard.revalidateSocket.mockRejectedValue(new Error('Token expired'));

      await gateway.handlePlaceBid(data, client);

      expect(client.emit).toHaveBeenCalledWith('bid:rejected', expect.objectContaining({ code: 'UNAUTHORIZED' }));
      expect(client.disconnect).toHaveBeenCalled();
      expect(bidService.placeBid).not.toHaveBeenCalled();
    });

    it('should emit bid:rejected with NOT_IN_AUCTION_ROOM when client has no auctionId', async () => {
      const client = createMockClient({ user: mockUser });
      wsJwtGuard.revalidateSocket.mockResolvedValue(mockUser);

      await gateway.handlePlaceBid(data, client);

      expect(client.emit).toHaveBeenCalledWith('bid:rejected', expect.objectContaining({ code: 'NOT_IN_AUCTION_ROOM' }));
      expect(bidService.placeBid).not.toHaveBeenCalled();
    });

    it('should emit bid:rejected with NOT_IN_AUCTION_ROOM when Redis auctionId does not match socket auctionId', async () => {
      const client = createMockClient({ user: mockUser, auctionId: 10 });
      wsJwtGuard.revalidateSocket.mockResolvedValue(mockUser);
      redisService.getSocketAuction.mockResolvedValue(99);

      await gateway.handlePlaceBid(data, client);

      expect(client.emit).toHaveBeenCalledWith('bid:rejected', expect.objectContaining({ code: 'NOT_IN_AUCTION_ROOM' }));
      expect(bidService.placeBid).not.toHaveBeenCalled();
    });

    it('should emit bid:rejected with bid details when bid is rejected by BidService', async () => {
      const client = createMockClient({ user: mockUser, auctionId: 10 });
      wsJwtGuard.revalidateSocket.mockResolvedValue(mockUser);
      redisService.getSocketAuction.mockResolvedValue(10);

      const failedResult: IBidResult = {
        success: false,
        code: 'BID_TOO_LOW',
        reason: 'Bid too low',
        currentPrice: 400,
        minNextBid: 410,
      };
      bidService.placeBid.mockResolvedValue(failedResult);

      await gateway.handlePlaceBid(data, client);

      expect(client.emit).toHaveBeenCalledWith(
        'bid:rejected',
        expect.objectContaining({
          code: 'BID_TOO_LOW',
          currentPrice: 400,
          minNextBid: 410,
        }),
      );
    });

    it('should broadcast new:highest:bid to auction room on successful bid', async () => {
      const client = createMockClient({ user: mockUser, auctionId: 10 });
      wsJwtGuard.revalidateSocket.mockResolvedValue(mockUser);
      redisService.getSocketAuction.mockResolvedValue(10);
      bidService.placeBid.mockResolvedValue({ success: true });

      await gateway.handlePlaceBid(data, client);

      expect(gateway.server.to).toHaveBeenCalledWith('auction_room_10');
      expect(gateway.server.to('auction_room_10').emit).toHaveBeenCalledWith('new:highest:bid', expect.objectContaining({ auctionId: 10, amount: 500 }));
      expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining('New highest bid'));
    });

    it('should emit bid:rejected with SERVER_ERROR when an unexpected error occurs', async () => {
      const client = createMockClient({ user: mockUser, auctionId: 10 });
      wsJwtGuard.revalidateSocket.mockResolvedValue(mockUser);
      redisService.getSocketAuction.mockRejectedValue(new Error('Redis error'));

      await gateway.handlePlaceBid(data, client);

      expect(client.emit).toHaveBeenCalledWith('bid:rejected', expect.objectContaining({ code: 'SERVER_ERROR' }));
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe('handleRequestCurrentState', () => {
    it('should emit error state when client has no auctionId', async () => {
      const client = createMockClient({ user: mockUser });

      await gateway.handleRequestCurrentState(client);

      expect(client.emit).toHaveBeenCalledWith('current:state', expect.objectContaining({ code: 'NOT_IN_AUCTION_ROOM' }));
      expect(bidService.getCurrentState).not.toHaveBeenCalled();
    });

    it('should emit current:state with auction data for authenticated user', async () => {
      const client = createMockClient({ user: mockUser, auctionId: 5 });
      const mockState: IAuctionState = {
        currentPrice: 300,
        isLeading: true,
        isActive: true,
        timeLeft: 120,
        participantsCount: 4,
      };
      bidService.getCurrentState.mockResolvedValue(mockState);

      await gateway.handleRequestCurrentState(client);

      expect(bidService.getCurrentState).toHaveBeenCalledWith(5, mockUser.sub);
      expect(client.emit).toHaveBeenCalledWith('current:state', expect.objectContaining({ auctionId: 5, currentPrice: 300, isLeading: true }));
    });

    it('should emit current:state with auction data for guest (userId undefined)', async () => {
      const client = createMockClient({ auctionId: 5 });
      const mockState: IAuctionState = { currentPrice: 100, isLeading: false, isActive: true, participantsCount: 0 };
      bidService.getCurrentState.mockResolvedValue(mockState);

      await gateway.handleRequestCurrentState(client);

      expect(bidService.getCurrentState).toHaveBeenCalledWith(5, undefined);
      expect(client.emit).toHaveBeenCalledWith('current:state', expect.objectContaining({ auctionId: 5 }));
    });

    it('should emit error state and log when BidService throws', async () => {
      const client = createMockClient({ user: mockUser, auctionId: 5 });
      bidService.getCurrentState.mockRejectedValue(new Error('Service error'));

      await gateway.handleRequestCurrentState(client);

      expect(client.emit).toHaveBeenCalledWith('current:state', expect.objectContaining({ code: 'GET_STATE_ERROR' }));
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe('notifyAuctionEnd', () => {
    it('should broadcast auction:ended to the auction room', () => {
      gateway.notifyAuctionEnd(10, 42, 500);

      expect(gateway.server.to).toHaveBeenCalledWith('auction_room_10');
      expect(gateway.server.to('auction_room_10').emit).toHaveBeenCalledWith('auction:ended', expect.objectContaining({ auctionId: 10, finalPrice: 500 }));
    });

    it('should emit auction:won to the winner personal room when winnerId is provided', () => {
      gateway.notifyAuctionEnd(10, 42, 500);

      expect(gateway.server.to).toHaveBeenCalledWith('user:42');
      expect(gateway.server.to('user:42').emit).toHaveBeenCalledWith('auction:won', expect.objectContaining({ auctionId: 10, finalPrice: 500 }));
    });

    it('should not emit auction:won when winnerId is undefined (no bids placed)', () => {
      gateway.notifyAuctionEnd(10, undefined, 100);

      const toCalls = (gateway.server.to as jest.Mock).mock.calls.map(([arg]) => arg as string);
      expect(toCalls).not.toContain(expect.stringContaining('user:'));
    });

    it('should log confirmation after successful notifications', () => {
      gateway.notifyAuctionEnd(10, 42, 500);

      expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining('Auction 10 ended — notification sent'));
    });

    it('should log error and not throw when server.to throws', () => {
      (gateway.server.to as jest.Mock).mockImplementation(() => {
        throw new Error('Socket error');
      });

      expect(() => gateway.notifyAuctionEnd(10, 42, 500)).not.toThrow();
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });
});
