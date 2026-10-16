import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { Language } from '@core/enums';
import { createUserFixture, createUserPreferencesFixture } from '@test/fixtures/users.fixtures';
import { createMockI18nService } from '@test/mocks/i18n.mock';
import { UsersService, UserPreferencesService } from '@modules/users';
import { BidRejectionCode, RedisService } from '@shared/redis';
import { MailService } from '@shared/mail';
import { BidRepository } from './repositories/bid.repository';
import { calcMinIncrement } from './bid.constants';
import { BidService } from './bid.service';
import { GetMyBidsQueryDto } from './dto';
import { Bid } from './entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { I18nService } from 'nestjs-i18n';

const MOCK_BID_CONFIG = { minIncrementPercent: 1, minIncrementAbsolute: 1 };
const LANGUAGE = Language.EN;

describe('BidService', () => {
  let service: BidService;
  let bidRepository: DeepMocked<BidRepository>;
  let redisService: DeepMocked<RedisService>;
  let usersService: DeepMocked<UsersService>;
  let userPreferencesService: DeepMocked<UserPreferencesService>;
  let mailService: DeepMocked<MailService>;

  const setupActiveAuction = (overrides: { owner?: number | null; isActive?: boolean; currentPrice?: number | null; highestBidder?: number | null } = {}) => {
    redisService.getAuctionOwner.mockResolvedValue(overrides.owner !== undefined ? overrides.owner : 99);
    redisService.isAuctionActive.mockResolvedValue(overrides.isActive !== undefined ? overrides.isActive : true);
    redisService.getLivePrice.mockResolvedValue(overrides.currentPrice !== undefined ? overrides.currentPrice : 100);
    redisService.getHighestBidderId.mockResolvedValue(overrides.highestBidder !== undefined ? overrides.highestBidder : null);
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BidService,
        {
          provide: BidRepository,
          useValue: createMock<BidRepository>(),
        },
        {
          provide: RedisService,
          useValue: createMock<RedisService>(),
        },
        {
          provide: I18nService,
          useValue: createMockI18nService(),
        },
        {
          provide: AppConfigService,
          useValue: { bid: MOCK_BID_CONFIG },
        },
        {
          provide: UsersService,
          useValue: createMock<UsersService>(),
        },
        {
          provide: UserPreferencesService,
          useValue: createMock<UserPreferencesService>(),
        },
        {
          provide: MailService,
          useValue: createMock<MailService>(),
        },
      ],
    }).compile();

    service = module.get<BidService>(BidService);
    bidRepository = module.get(BidRepository);
    redisService = module.get(RedisService);
    usersService = module.get(UsersService);
    userPreferencesService = module.get(UserPreferencesService);
    mailService = module.get(MailService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findMyBids', () => {
    let mockQuery: GetMyBidsQueryDto;
    let responseSpy: jest.SpyInstance;

    beforeEach(() => {
      mockQuery = new GetMyBidsQueryDto();
      mockQuery.page = 1;
      mockQuery.limit = 10;

      responseSpy = jest.spyOn(mockQuery, 'response');
    });

    it('should fetch paginated bids for a user and map them to MyBidResponse', async () => {
      const mockUserId = 5;
      const mockBids = [{ id: 1, amount: 150, auctionId: 10, userId: mockUserId } as Bid, { id: 2, amount: 200, auctionId: 11, userId: mockUserId } as Bid];

      bidRepository.findPaginatedBidByUser.mockResolvedValue([mockBids, 2]);

      const result = await service.findMyBids(mockUserId, mockQuery);

      expect(bidRepository.findPaginatedBidByUser).toHaveBeenCalledWith(mockUserId, 0, 10, expect.any(Object));

      expect(responseSpy).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 1, amount: 150 }), expect.objectContaining({ id: 2, amount: 200 })]),
        1,
        10,
        2,
      );

      expect(result.total).toBe(2);
      expect(result.items.length).toBe(2);
    });

    it('should return empty list when user has no bids', async () => {
      bidRepository.findPaginatedBidByUser.mockResolvedValue([[], 0]);

      const result = await service.findMyBids(99, mockQuery);

      expect(bidRepository.findPaginatedBidByUser).toHaveBeenCalledWith(99, 0, 10, expect.any(Object));
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('placeBid — input validation', () => {
    it('should return INVALID_AMOUNT when amount is 0', async () => {
      const result = await service.placeBid(1, 1, 0, LANGUAGE);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'INVALID_AMOUNT' }));
      expect(redisService.getAuctionOwner).not.toHaveBeenCalled();
    });

    it('should return INVALID_AMOUNT when amount is negative', async () => {
      const result = await service.placeBid(1, 1, -50, LANGUAGE);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'INVALID_AMOUNT' }));
    });

    it('should return INVALID_AMOUNT when amount is Infinity', async () => {
      const result = await service.placeBid(1, 1, Infinity, LANGUAGE);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'INVALID_AMOUNT' }));
    });
  });

  describe('placeBid — business rules', () => {
    it('should return AUCTION_ENDED and log warn when owner key is missing in Redis', async () => {
      setupActiveAuction({ owner: null });

      const result = await service.placeBid(1, 5, 150, LANGUAGE);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'AUCTION_ENDED' }));
      expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('Owner key missing'));
      expect(redisService.placeBidAtomicWithSnapshot).not.toHaveBeenCalled();
    });

    it('should return OWNER_CANNOT_BID when userId matches ownerId', async () => {
      setupActiveAuction({ owner: 5 });

      const result = await service.placeBid(1, 5, 150, LANGUAGE);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'OWNER_CANNOT_BID' }));
      expect(redisService.placeBidAtomicWithSnapshot).not.toHaveBeenCalled();
    });

    it('should return AUCTION_ENDED when auction is not active in Redis', async () => {
      setupActiveAuction({ isActive: false });

      const result = await service.placeBid(1, 5, 150, LANGUAGE);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'AUCTION_ENDED' }));
      expect(redisService.placeBidAtomicWithSnapshot).not.toHaveBeenCalled();
    });

    it('should return BID_TOO_LOW with price details when amount is below currentPrice + MIN_BID_INCREMENT for subsequent bids', async () => {
      setupActiveAuction({ currentPrice: 200, highestBidder: 1 });

      const result = await service.placeBid(1, 5, 200, LANGUAGE);
      const expectedMinIncrement = calcMinIncrement(200);

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          code: 'BID_TOO_LOW',
          currentPrice: 200,
          minNextBid: 200 + expectedMinIncrement,
        }),
      );
      expect(redisService.placeBidAtomicWithSnapshot).not.toHaveBeenCalled();
    });

    it('should allow first bid equal to startingPrice when no prior bids exist (highestBidder is null)', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: 200, previousBidderId: null } };

      setupActiveAuction({ currentPrice: 200, highestBidder: null });

      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);
      bidRepository.saveBidAndUpdateAuctionPrice.mockResolvedValue({} as Bid);

      const result = await service.placeBid(1, 5, 200, LANGUAGE);

      expect(result.success).toBe(true);
      expect(redisService.placeBidAtomicWithSnapshot).toHaveBeenCalledWith(1, 5, 200, calcMinIncrement(200));
    });

    it('should return BID_TOO_LOW on first bid when amount is below startingPrice', async () => {
      setupActiveAuction({ currentPrice: 200, highestBidder: null });

      const result = await service.placeBid(1, 5, 190, LANGUAGE);

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          code: 'BID_TOO_LOW',
          currentPrice: 200,
          minNextBid: 200,
        }),
      );
      expect(redisService.placeBidAtomicWithSnapshot).not.toHaveBeenCalled();
    });

    it('should allow bid exactly equal to currentPrice + minIncrement for subsequent bids', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: 200, previousBidderId: 1 } };

      setupActiveAuction({ currentPrice: 200, highestBidder: 1 });

      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);
      bidRepository.saveBidAndUpdateAuctionPrice.mockResolvedValue({} as Bid);

      const minIncrement = calcMinIncrement(200);
      const result = await service.placeBid(1, 5, 200 + minIncrement, LANGUAGE);

      expect(result.success).toBe(true);
    });

    it('should skip price check and proceed when currentPrice is null (first bid fallback)', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: null, previousBidderId: null } };

      setupActiveAuction({ currentPrice: null });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);
      bidRepository.saveBidAndUpdateAuctionPrice.mockResolvedValue({} as Bid);

      const result = await service.placeBid(1, 5, 1, LANGUAGE);

      expect(result.success).toBe(true);
    });
  });

  describe('placeBid — atomic path', () => {
    it('should save bid to DB and return success when atomic bid succeeds', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: 100, previousBidderId: null } };

      setupActiveAuction({ currentPrice: 100 });

      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);
      const mockBid = { auctionId: 1, userId: 5, amount: 150 } as Bid;

      bidRepository.saveBidAndUpdateAuctionPrice.mockResolvedValue(mockBid);

      const result = await service.placeBid(1, 5, 150, LANGUAGE);

      expect(redisService.placeBidAtomicWithSnapshot).toHaveBeenCalledWith(1, 5, 150, calcMinIncrement(100));
      expect(bidRepository.saveBidAndUpdateAuctionPrice).toHaveBeenCalledWith(1, 5, 150);
      expect(result).toEqual({ success: true, bid: mockBid, previousBidderId: null });
      expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining('Bid placed'));
    });

    it('should handle concurrent bids with the same amount: first user succeeds, second user is rejected with OUTBID', async () => {
      setupActiveAuction({ currentPrice: 100, highestBidder: null });

      // Simulate Redis Lua script serialization:
      // User 1 arrives first: accepted (snapshot returned)
      // User 2 arrives second: rejected by Lua script with BID_TOO_LOW because price was updated
      redisService.placeBidAtomicWithSnapshot
        .mockResolvedValueOnce({ success: true, data: { previousPrice: 100, previousBidderId: null } })
        .mockResolvedValueOnce({ success: false, rejectionCode: BidRejectionCode.BID_TOO_LOW });

      redisService.getLivePrice
        .mockResolvedValueOnce(100) // user 1 pre-check
        .mockResolvedValueOnce(100) // user 2 pre-check (read before Redis atomic update)
        .mockResolvedValueOnce(150); // user 2 post-rejection getLivePrice

      const mockBid = { id: 1, auctionId: 1, userId: 10, amount: 150 } as Bid;
      bidRepository.saveBidAndUpdateAuctionPrice.mockResolvedValue(mockBid);

      const [resultUser1, resultUser2] = await Promise.all([service.placeBid(1, 10, 150, LANGUAGE), service.placeBid(1, 20, 150, LANGUAGE)]);

      expect(resultUser1).toEqual(expect.objectContaining({ success: true, bid: mockBid }));
      expect(resultUser2).toEqual(
        expect.objectContaining({
          success: false,
          code: 'OUTBID',
          currentPrice: 150,
        }),
      );
      // DB persistence happens only once for the winning bidder
      expect(bidRepository.saveBidAndUpdateAuctionPrice).toHaveBeenCalledTimes(1);
    });

    it('should rollback Redis and return SERVER_ERROR when DB save fails after atomic bid', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: 100, previousBidderId: 3 } };

      setupActiveAuction({ currentPrice: 100 });

      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);

      bidRepository.saveBidAndUpdateAuctionPrice.mockRejectedValue(new Error('DB error'));
      redisService.rollbackBid.mockResolvedValue(undefined);

      const result = await service.placeBid(1, 5, 150, LANGUAGE);

      expect(redisService.rollbackBid).toHaveBeenCalledWith(1, 150, 5, 100, 3);
      expect(result).toEqual(expect.objectContaining({ success: false, code: 'SERVER_ERROR' }));
      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('DB save failed after atomic bid'), expect.any(String));
    });

    it('should pass null previousPrice and null previousBidderId to rollback when no prior bids exist', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: null, previousBidderId: null } };

      setupActiveAuction({ currentPrice: null });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);
      bidRepository.saveBidAndUpdateAuctionPrice.mockRejectedValue(new Error('DB error'));

      await service.placeBid(1, 5, 50, LANGUAGE);

      expect(redisService.rollbackBid).toHaveBeenCalledWith(1, 50, 5, null, null);
    });

    it('should return OUTBID with current price when atomic bid fails with code 4 (amount too low at Lua level)', async () => {
      setupActiveAuction({ currentPrice: 100 });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue({ success: false, rejectionCode: BidRejectionCode.BID_TOO_LOW });
      redisService.getLivePrice.mockResolvedValueOnce(100).mockResolvedValueOnce(120);

      const result = await service.placeBid(1, 5, 150, LANGUAGE);

      expect(bidRepository.saveBidAndUpdateAuctionPrice).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          code: 'OUTBID',
          currentPrice: 120,
        }),
      );
    });

    it('should return OUTBID when atomic bid fails with no rejection code (unknown/exception fallback)', async () => {
      setupActiveAuction({ currentPrice: 100 });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue({ success: false });
      redisService.getLivePrice.mockResolvedValueOnce(100).mockResolvedValueOnce(120);

      const result = await service.placeBid(1, 5, 150, LANGUAGE);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'OUTBID' }));
    });

    it('should return ALREADY_LEADING with current price when atomic bid fails with code 3 (self-outbid)', async () => {
      setupActiveAuction({ currentPrice: 100 });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue({ success: false, rejectionCode: BidRejectionCode.ALREADY_LEADING });
      redisService.getLivePrice.mockResolvedValue(100);

      const result = await service.placeBid(1, 5, 150, LANGUAGE);

      expect(bidRepository.saveBidAndUpdateAuctionPrice).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          code: 'ALREADY_LEADING',
          currentPrice: 100,
        }),
      );
    });

    it('should return AUCTION_ENDED when atomic bid fails with code 2 (auction became inactive)', async () => {
      setupActiveAuction({ currentPrice: 100 });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue({ success: false, rejectionCode: BidRejectionCode.AUCTION_INACTIVE });

      const result = await service.placeBid(1, 5, 150, LANGUAGE);

      expect(bidRepository.saveBidAndUpdateAuctionPrice).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ success: false, code: 'AUCTION_ENDED' }));
      expect(redisService.getLivePrice).not.toHaveBeenCalledTimes(2);
    });

    it('should use snapshot from atomic script as rollback data — not a separate getHighestBidderId call on rollback', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: 100, previousBidderId: 7 } };

      setupActiveAuction({ currentPrice: 100 });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);
      bidRepository.saveBidAndUpdateAuctionPrice.mockRejectedValue(new Error('DB failure'));
      redisService.rollbackBid.mockResolvedValue(undefined);

      await service.placeBid(1, 5, 150, LANGUAGE);

      // Called once in initial check, but NOT called during rollback
      expect(redisService.getHighestBidderId).toHaveBeenCalledTimes(1);
      expect(redisService.rollbackBid).toHaveBeenCalledWith(1, 150, 5, 100, 7);
    });

    it('should return SERVER_ERROR and log error when an unexpected error is thrown', async () => {
      redisService.getAuctionOwner.mockRejectedValue(new Error('Unexpected Redis crash'));

      const result = await service.placeBid(1, 5, 150, LANGUAGE);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'SERVER_ERROR' }));
      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('Error placing bid'), expect.anything());
    });
  });

  describe('getCurrentState', () => {
    it('should return full state with isLeading=true when requestingUserId matches highestBidderId', async () => {
      redisService.getLivePrice.mockResolvedValue(300);
      redisService.getHighestBidderId.mockResolvedValue(5);
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.getUniqueParticipantsCount.mockResolvedValue(10);

      const result = await service.getCurrentState(1, 5);

      expect(result).toEqual({
        currentPrice: 300,
        isLeading: true,
        isActive: true,
        participantsCount: 10,
      });
    });

    it('should return isLeading=false when requestingUserId does not match highestBidderId', async () => {
      redisService.getLivePrice.mockResolvedValue(300);
      redisService.getHighestBidderId.mockResolvedValue(9);
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.getUniqueParticipantsCount.mockResolvedValue(3);

      const result = await service.getCurrentState(1, 5);

      expect(result.isLeading).toBe(false);
    });

    it('should return isLeading=false when requestingUserId is undefined (guest)', async () => {
      redisService.getLivePrice.mockResolvedValue(300);
      redisService.getHighestBidderId.mockResolvedValue(5);
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.getUniqueParticipantsCount.mockResolvedValue(2);

      const result = await service.getCurrentState(1, undefined);

      expect(result.isLeading).toBe(false);
    });

    it('should return currentPrice=0 when getLivePrice returns null', async () => {
      redisService.getLivePrice.mockResolvedValue(null);
      redisService.getHighestBidderId.mockResolvedValue(null);
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.getUniqueParticipantsCount.mockResolvedValue(0);

      const result = await service.getCurrentState(1);

      expect(result.currentPrice).toBe(0);
    });

    it('should return participantsCount=0 when getUniqueParticipantsCount returns 0', async () => {
      redisService.getLivePrice.mockResolvedValue(100);
      redisService.getHighestBidderId.mockResolvedValue(null);
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.getUniqueParticipantsCount.mockResolvedValue(0);

      const result = await service.getCurrentState(1);

      expect(result.participantsCount).toBe(0);
    });

    it('should fetch all 4 Redis values in parallel via Promise.all', async () => {
      redisService.getLivePrice.mockResolvedValue(100);
      redisService.getHighestBidderId.mockResolvedValue(null);
      redisService.isAuctionActive.mockResolvedValue(false);
      redisService.getUniqueParticipantsCount.mockResolvedValue(0);

      await service.getCurrentState(1);

      expect(redisService.getLivePrice).toHaveBeenCalledWith(1);
      expect(redisService.getHighestBidderId).toHaveBeenCalledWith(1);
      expect(redisService.isAuctionActive).toHaveBeenCalledWith(1);
      expect(redisService.getUniqueParticipantsCount).toHaveBeenCalledWith(1);
    });

    it('should propagate error and log when Redis throws', async () => {
      redisService.getLivePrice.mockRejectedValue(new Error('Redis down'));

      await expect(service.getCurrentState(1, 5)).rejects.toThrow('Redis down');

      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('Error getting current state'), expect.anything());
    });
  });

  describe('handleOutbidEmailNotification', () => {
    const auctionId = 10;
    const previousBidderId = 42;
    const newAmount = 500;
    const auctionTitle = 'Vintage Watch';

    it('should send outbid email when user has notifyOnOutbid enabled and cooldown acquired', async () => {
      userPreferencesService.findOrCreateByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnOutbid: true, lang: Language.EN }));
      redisService.acquireOutbidEmailCooldown.mockResolvedValue(true);
      usersService.findOneBy.mockResolvedValue(createUserFixture({ id: previousBidderId, email: 'prev@example.com', firstName: 'Prev', lastName: 'Bidder' }));

      await service.handleOutbidEmailNotification(auctionId, previousBidderId, newAmount, auctionTitle);

      expect(userPreferencesService.findOrCreateByUserId).toHaveBeenCalledWith(previousBidderId);
      expect(redisService.acquireOutbidEmailCooldown).toHaveBeenCalledWith(auctionId, previousBidderId, 600);
      expect(usersService.findOneBy).toHaveBeenCalledWith({ id: previousBidderId });
      expect(mailService.sendAuctionOutbidEmail).toHaveBeenCalledWith('prev@example.com', Language.EN, 'Prev Bidder', auctionTitle, newAmount, auctionId);
    });

    it('should use default auction title if none is provided', async () => {
      userPreferencesService.findOrCreateByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnOutbid: true, lang: Language.EN }));
      redisService.acquireOutbidEmailCooldown.mockResolvedValue(true);
      usersService.findOneBy.mockResolvedValue(createUserFixture({ id: previousBidderId, email: 'prev@example.com', firstName: 'Prev', lastName: 'Bidder' }));

      await service.handleOutbidEmailNotification(auctionId, previousBidderId, newAmount);

      expect(mailService.sendAuctionOutbidEmail).toHaveBeenCalledWith('prev@example.com', Language.EN, 'Prev Bidder', `Auction #${auctionId}`, newAmount, auctionId);
    });

    it('should skip email if user has notifyOnOutbid disabled', async () => {
      userPreferencesService.findOrCreateByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnOutbid: false }));

      await service.handleOutbidEmailNotification(auctionId, previousBidderId, newAmount, auctionTitle);

      expect(redisService.acquireOutbidEmailCooldown).not.toHaveBeenCalled();
      expect(mailService.sendAuctionOutbidEmail).not.toHaveBeenCalled();
    });

    it('should skip email if outbid cooldown is active in Redis', async () => {
      userPreferencesService.findOrCreateByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnOutbid: true }));
      redisService.acquireOutbidEmailCooldown.mockResolvedValue(false);

      await service.handleOutbidEmailNotification(auctionId, previousBidderId, newAmount, auctionTitle);

      expect(usersService.findOneBy).not.toHaveBeenCalled();
      expect(mailService.sendAuctionOutbidEmail).not.toHaveBeenCalled();
    });

    it('should skip email if user is not found or has no email', async () => {
      userPreferencesService.findOrCreateByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnOutbid: true }));
      redisService.acquireOutbidEmailCooldown.mockResolvedValue(true);
      usersService.findOneBy.mockResolvedValue(null);

      await service.handleOutbidEmailNotification(auctionId, previousBidderId, newAmount, auctionTitle);

      expect(mailService.sendAuctionOutbidEmail).not.toHaveBeenCalled();
    });
  });
});
