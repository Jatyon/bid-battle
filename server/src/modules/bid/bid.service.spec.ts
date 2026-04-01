import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { createMockI18nService } from '@test/mocks/i18n.mock';
import { BidRejectionCode, RedisService } from '@shared/redis';
import { BidRepository } from './repositories/bid.repository';
import { calcMinIncrement } from './bid.constants';
import { BidService } from './bid.service';
import { Bid } from './entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { I18nService } from 'nestjs-i18n';
import { Paginator } from '@core/models';

const MOCK_BID_CONFIG = { minIncrementPercent: 1, minIncrementAbsolute: 1 };

describe('BidService', () => {
  let service: BidService;
  let bidRepository: DeepMocked<BidRepository>;
  let redisService: DeepMocked<RedisService>;

  const setupActiveAuction = (overrides: { owner?: number | null; isActive?: boolean; currentPrice?: number | null; highestBidder?: number | null } = {}) => {
    redisService.getAuctionOwner.mockResolvedValue(overrides.owner !== undefined ? overrides.owner : 99);
    redisService.isAuctionActive.mockResolvedValue(overrides.isActive !== undefined ? overrides.isActive : true);
    redisService.getLivePrice.mockResolvedValue(overrides.currentPrice !== undefined ? overrides.currentPrice : 100);
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
      ],
    }).compile();

    service = module.get<BidService>(BidService);
    bidRepository = module.get(BidRepository);
    redisService = module.get(RedisService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findMyBids', () => {
    let mockPaginator: Paginator;
    let responseSpy: jest.SpyInstance;

    beforeEach(() => {
      mockPaginator = new Paginator();
      mockPaginator.page = 1;
      mockPaginator.limit = 10;

      responseSpy = jest.spyOn(mockPaginator, 'response');
    });

    it('should fetch paginated bids for a user and map them to MyBidResponse', async () => {
      const mockUserId = 5;
      const mockBids = [{ id: 1, amount: 150, auctionId: 10, userId: mockUserId } as Bid, { id: 2, amount: 200, auctionId: 11, userId: mockUserId } as Bid];

      bidRepository.findPaginatedBidByUser.mockResolvedValue([mockBids, 2]);

      const result = await service.findMyBids(mockUserId, mockPaginator);

      expect(bidRepository.findPaginatedBidByUser).toHaveBeenCalledWith(mockUserId, 0, 10);

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

      const result = await service.findMyBids(99, mockPaginator);

      expect(bidRepository.findPaginatedBidByUser).toHaveBeenCalledWith(99, 0, 10);
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('placeBid — input validation', () => {
    it('should return INVALID_AMOUNT when amount is 0', async () => {
      const result = await service.placeBid(1, 1, 0);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'INVALID_AMOUNT' }));
      expect(redisService.getAuctionOwner).not.toHaveBeenCalled();
    });

    it('should return INVALID_AMOUNT when amount is negative', async () => {
      const result = await service.placeBid(1, 1, -50);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'INVALID_AMOUNT' }));
    });

    it('should return INVALID_AMOUNT when amount is Infinity', async () => {
      const result = await service.placeBid(1, 1, Infinity);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'INVALID_AMOUNT' }));
    });
  });

  describe('placeBid — business rules', () => {
    it('should return AUCTION_ENDED and log warn when owner key is missing in Redis', async () => {
      setupActiveAuction({ owner: null });

      const result = await service.placeBid(1, 5, 150);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'AUCTION_ENDED' }));
      expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('Owner key missing'));
      expect(redisService.placeBidAtomicWithSnapshot).not.toHaveBeenCalled();
    });

    it('should return OWNER_CANNOT_BID when userId matches ownerId', async () => {
      setupActiveAuction({ owner: 5 });

      const result = await service.placeBid(1, 5, 150);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'OWNER_CANNOT_BID' }));
      expect(redisService.placeBidAtomicWithSnapshot).not.toHaveBeenCalled();
    });

    it('should return AUCTION_ENDED when auction is not active in Redis', async () => {
      setupActiveAuction({ isActive: false });

      const result = await service.placeBid(1, 5, 150);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'AUCTION_ENDED' }));
      expect(redisService.placeBidAtomicWithSnapshot).not.toHaveBeenCalled();
    });

    it('should return BID_TOO_LOW with price details when amount is below currentPrice + MIN_BID_INCREMENT', async () => {
      setupActiveAuction({ currentPrice: 200 });

      const result = await service.placeBid(1, 5, 200);
      const expectedMinIncrement = calcMinIncrement(200, MOCK_BID_CONFIG.minIncrementPercent, MOCK_BID_CONFIG.minIncrementAbsolute);

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

    it('should allow bid exactly equal to currentPrice + minIncrement', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: 200, previousBidderId: null } };

      setupActiveAuction({ currentPrice: 200 });

      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);
      bidRepository.create.mockReturnValue({} as Bid);
      bidRepository.save.mockResolvedValue({} as Bid);

      const minIncrement = calcMinIncrement(200, MOCK_BID_CONFIG.minIncrementPercent, MOCK_BID_CONFIG.minIncrementAbsolute);
      const result = await service.placeBid(1, 5, 200 + minIncrement);

      expect(result.success).toBe(true);
    });

    it('should skip price check and proceed when currentPrice is null (first bid)', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: null, previousBidderId: null } };

      setupActiveAuction({ currentPrice: null });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);
      bidRepository.create.mockReturnValue({} as Bid);
      bidRepository.save.mockResolvedValue({} as Bid);

      const result = await service.placeBid(1, 5, 1);

      expect(result.success).toBe(true);
    });
  });

  describe('placeBid — atomic path', () => {
    it('should save bid to DB and return success when atomic bid succeeds', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: 100, previousBidderId: null } };

      setupActiveAuction({ currentPrice: 100 });

      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);
      const mockBid = { auctionId: 1, userId: 5, amount: 150 } as Bid;

      bidRepository.create.mockReturnValue(mockBid);
      bidRepository.save.mockResolvedValue(mockBid);

      const result = await service.placeBid(1, 5, 150);

      expect(redisService.placeBidAtomicWithSnapshot).toHaveBeenCalledWith(
        1,
        5,
        150,
        calcMinIncrement(100, MOCK_BID_CONFIG.minIncrementPercent, MOCK_BID_CONFIG.minIncrementAbsolute),
      );
      expect(bidRepository.create).toHaveBeenCalledWith({ auctionId: 1, userId: 5, amount: 150 });
      expect(bidRepository.save).toHaveBeenCalledWith(mockBid);
      expect(result).toEqual({ success: true });
      expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining('Bid placed'));
    });

    it('should rollback Redis and return SERVER_ERROR when DB save fails after atomic bid', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: 100, previousBidderId: 3 } };

      setupActiveAuction({ currentPrice: 100 });

      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);

      bidRepository.create.mockReturnValue({} as Bid);
      bidRepository.save.mockRejectedValue(new Error('DB error'));
      redisService.rollbackBid.mockResolvedValue(undefined);

      const result = await service.placeBid(1, 5, 150);

      expect(redisService.rollbackBid).toHaveBeenCalledWith(1, 100, 3);
      expect(result).toEqual(expect.objectContaining({ success: false, code: 'SERVER_ERROR' }));
      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('DB save failed after atomic bid'), expect.any(String));
    });

    it('should pass null previousPrice and null previousBidderId to rollback when no prior bids exist', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: null, previousBidderId: null } };

      setupActiveAuction({ currentPrice: null });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);
      bidRepository.create.mockReturnValue({} as Bid);
      bidRepository.save.mockRejectedValue(new Error('DB error'));

      await service.placeBid(1, 5, 50);

      expect(redisService.rollbackBid).toHaveBeenCalledWith(1, null, null);
    });

    it('should return OUTBID with current price when atomic bid fails with code 4 (amount too low at Lua level)', async () => {
      setupActiveAuction({ currentPrice: 100 });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue({ success: false, rejectionCode: BidRejectionCode.BID_TOO_LOW });
      redisService.getLivePrice.mockResolvedValueOnce(100).mockResolvedValueOnce(120);

      const result = await service.placeBid(1, 5, 150);

      expect(bidRepository.save).not.toHaveBeenCalled();
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

      const result = await service.placeBid(1, 5, 150);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'OUTBID' }));
    });

    it('should return ALREADY_LEADING with current price when atomic bid fails with code 3 (self-outbid)', async () => {
      setupActiveAuction({ currentPrice: 100 });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue({ success: false, rejectionCode: BidRejectionCode.ALREADY_LEADING });
      redisService.getLivePrice.mockResolvedValue(100);

      const result = await service.placeBid(1, 5, 150);

      expect(bidRepository.save).not.toHaveBeenCalled();
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

      const result = await service.placeBid(1, 5, 150);

      expect(bidRepository.save).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ success: false, code: 'AUCTION_ENDED' }));
      expect(redisService.getLivePrice).not.toHaveBeenCalledTimes(2);
    });

    it('should use snapshot from atomic script as rollback data — not a separate getHighestBidderId call', async () => {
      const resultPlaceBidAtomic = { success: true, data: { previousPrice: 100, previousBidderId: 7 } };

      setupActiveAuction({ currentPrice: 100 });
      redisService.placeBidAtomicWithSnapshot.mockResolvedValue(resultPlaceBidAtomic);
      bidRepository.create.mockReturnValue({} as Bid);
      bidRepository.save.mockResolvedValue({} as Bid);

      await service.placeBid(1, 5, 150);

      expect(redisService.getHighestBidderId).not.toHaveBeenCalled();
    });

    it('should return SERVER_ERROR and log error when an unexpected error is thrown', async () => {
      redisService.getAuctionOwner.mockRejectedValue(new Error('Unexpected Redis crash'));

      const result = await service.placeBid(1, 5, 150);

      expect(result).toEqual(expect.objectContaining({ success: false, code: 'SERVER_ERROR' }));
      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('Error placing bid'), expect.anything());
    });
  });

  describe('getCurrentState', () => {
    it('should return full state with isLeading=true when requestingUserId matches highestBidderId', async () => {
      redisService.getLivePrice.mockResolvedValue(300);
      redisService.getHighestBidderId.mockResolvedValue(5);
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.getAuctionParticipantsCount.mockResolvedValue(10);

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
      redisService.getAuctionParticipantsCount.mockResolvedValue(3);

      const result = await service.getCurrentState(1, 5);

      expect(result.isLeading).toBe(false);
    });

    it('should return isLeading=false when requestingUserId is undefined (guest)', async () => {
      redisService.getLivePrice.mockResolvedValue(300);
      redisService.getHighestBidderId.mockResolvedValue(5);
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.getAuctionParticipantsCount.mockResolvedValue(2);

      const result = await service.getCurrentState(1, undefined);

      expect(result.isLeading).toBe(false);
    });

    it('should return currentPrice=0 when getLivePrice returns null', async () => {
      redisService.getLivePrice.mockResolvedValue(null);
      redisService.getHighestBidderId.mockResolvedValue(null);
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.getAuctionParticipantsCount.mockResolvedValue(0);

      const result = await service.getCurrentState(1);

      expect(result.currentPrice).toBe(0);
    });

    it('should return participantsCount=0 when getAuctionParticipantsCount returns 0', async () => {
      redisService.getLivePrice.mockResolvedValue(100);
      redisService.getHighestBidderId.mockResolvedValue(null);
      redisService.isAuctionActive.mockResolvedValue(true);
      redisService.getAuctionParticipantsCount.mockResolvedValue(0);

      const result = await service.getCurrentState(1);

      expect(result.participantsCount).toBe(0);
    });

    it('should fetch all 4 Redis values in parallel via Promise.all', async () => {
      redisService.getLivePrice.mockResolvedValue(100);
      redisService.getHighestBidderId.mockResolvedValue(null);
      redisService.isAuctionActive.mockResolvedValue(false);
      redisService.getAuctionParticipantsCount.mockResolvedValue(0);

      await service.getCurrentState(1);

      expect(redisService.getLivePrice).toHaveBeenCalledWith(1);
      expect(redisService.getHighestBidderId).toHaveBeenCalledWith(1);
      expect(redisService.isAuctionActive).toHaveBeenCalledWith(1);
      expect(redisService.getAuctionParticipantsCount).toHaveBeenCalledWith(1);
    });

    it('should propagate error and log when Redis throws', async () => {
      redisService.getLivePrice.mockRejectedValue(new Error('Redis down'));

      await expect(service.getCurrentState(1, 5)).rejects.toThrow('Redis down');

      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('Error getting current state'), expect.anything());
    });
  });
});
