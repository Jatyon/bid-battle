import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Paginator, PaginatorResponse } from '@core/models';
import { SortOrder } from '@core/enums';
import {
  createAuctionFixture,
  createCreateAuctionDtoFixture,
  createUpdateAuctionDtoFixture,
  createAuctionImageFixture,
  createMockFilesFixture,
} from '@test/fixtures/auctions.fixtures';
import { BidRepository } from '@modules/bid/repositories/bid.repository';
import { FileUploadService, IUploadedFile } from '@shared/file-upload';
import { RedisService } from '@shared/redis';
import { AuctionCategory, AuctionSortBy, AuctionStatus } from './enums';
import { AuctionResponse, AuctionDetailResponse, GetAuctionsQueryDto } from './dto';
import { AuctionsRepository } from './repositories/auctions.repository';
import { AuctionScheduler } from './auction.scheduler';
import { AuctionsService } from './auctions.service';
import { AuctionImage, Auction } from './entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { DataSource, Repository } from 'typeorm';
import { I18nContext } from 'nestjs-i18n';

describe('AuctionsService', () => {
  let service: AuctionsService;
  let auctionsRepository: DeepMocked<AuctionsRepository>;
  let auctionImageRepository: DeepMocked<Repository<AuctionImage>>;
  let bidRepository: DeepMocked<BidRepository>;
  let redisService: DeepMocked<RedisService>;
  let fileUploadService: DeepMocked<FileUploadService>;
  let auctionScheduler: DeepMocked<AuctionScheduler>;
  let dataSource: DeepMocked<DataSource>;

  const mockManager = { delete: jest.fn(), save: jest.fn(), findOne: jest.fn(), count: jest.fn() };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: jest.fn(),
      save: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionsService,
        {
          provide: AuctionsRepository,
          useValue: createMock<AuctionsRepository>(),
        },
        {
          provide: getRepositoryToken(AuctionImage),
          useValue: createMock<Repository<AuctionImage>>(),
        },
        {
          provide: BidRepository,
          useValue: createMock<BidRepository>(),
        },
        {
          provide: RedisService,
          useValue: createMock<RedisService>(),
        },
        {
          provide: FileUploadService,
          useValue: createMock<FileUploadService>(),
        },
        {
          provide: AuctionScheduler,
          useValue: createMock<AuctionScheduler>(),
        },
        {
          provide: DataSource,
          useValue: createMock<DataSource>(),
        },
      ],
    }).compile();

    service = module.get<AuctionsService>(AuctionsService);
    auctionsRepository = module.get(AuctionsRepository);
    auctionImageRepository = module.get(getRepositoryToken(AuctionImage));
    bidRepository = module.get(BidRepository);
    redisService = module.get(RedisService);
    fileUploadService = module.get(FileUploadService);
    auctionScheduler = module.get(AuctionScheduler);
    dataSource = module.get(DataSource);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('createAuction', () => {
    beforeEach(() => {
      (dataSource.createQueryRunner as jest.Mock).mockReturnValue(mockQueryRunner);
      mockQueryRunner.connect.mockResolvedValue(undefined);
      mockQueryRunner.startTransaction.mockResolvedValue(undefined);
      mockQueryRunner.commitTransaction.mockResolvedValue(undefined);
      mockQueryRunner.rollbackTransaction.mockResolvedValue(undefined);
      mockQueryRunner.release.mockResolvedValue(undefined);
    });

    it('should create auction successfully with status PENDING and schedule it', async () => {
      const mockDto = createCreateAuctionDtoFixture();
      const mockAuction = createAuctionFixture();
      const savedAuction = { ...mockAuction, id: 1 };

      mockQueryRunner.manager.create.mockReturnValue(mockAuction);
      mockQueryRunner.manager.save.mockResolvedValue(savedAuction);
      auctionScheduler.scheduleAuctionStart.mockResolvedValue(undefined);

      const result = await service.createAuction(mockDto, 1);

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Auction,
        expect.objectContaining({
          title: mockDto.title,
          description: mockDto.description,
          startingPrice: mockDto.startingPrice,
          endTime: mockDto.endTime,
          ownerId: 1,
          currentPrice: mockDto.startingPrice,
          status: AuctionStatus.PENDING,
          mainImageUrl: mockDto.imageUrls[0],
          images: expect.arrayContaining([
            { imageUrl: mockDto.imageUrls[0], isPrimary: true },
            { imageUrl: mockDto.imageUrls[1], isPrimary: false },
          ]) as unknown as AuctionImage[],
        }),
      );

      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(Auction, mockAuction);
      expect(auctionScheduler.scheduleAuctionStart).toHaveBeenCalledWith(savedAuction.id, expect.any(Date));
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(result).toBeInstanceOf(AuctionResponse);
    });

    it('should set correct primary image when primaryImageIndex is provided', async () => {
      const mockDto = createCreateAuctionDtoFixture({ primaryImageIndex: 1 });
      const mockAuction = createAuctionFixture();

      mockQueryRunner.manager.create.mockReturnValue(mockAuction);
      mockQueryRunner.manager.save.mockResolvedValue({ ...mockAuction, id: 1 });
      auctionScheduler.scheduleAuctionStart.mockResolvedValue(undefined);

      await service.createAuction(mockDto, 1);

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Auction,
        expect.objectContaining({
          mainImageUrl: mockDto.imageUrls[1],
          images: expect.arrayContaining([
            { imageUrl: mockDto.imageUrls[0], isPrimary: false },
            { imageUrl: mockDto.imageUrls[1], isPrimary: true },
          ]) as unknown as AuctionImage[],
        }),
      );
    });

    it('should default primaryImageIndex to 0 when not provided', async () => {
      const dtoWithoutIndex = createCreateAuctionDtoFixture({ primaryImageIndex: undefined });
      const mockAuction = createAuctionFixture();

      mockQueryRunner.manager.create.mockReturnValue(mockAuction);
      mockQueryRunner.manager.save.mockResolvedValue({ ...mockAuction, id: 1 });
      auctionScheduler.scheduleAuctionStart.mockResolvedValue(undefined);

      await service.createAuction(dtoWithoutIndex, 1);

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Auction,
        expect.objectContaining({
          mainImageUrl: dtoWithoutIndex.imageUrls[0],
        }),
      );
    });

    it('should throw BadRequestException when primaryImageIndex is out of bounds', async () => {
      const invalidDto = createCreateAuctionDtoFixture({ primaryImageIndex: 5 });

      await expect(service.createAuction(invalidDto, 1)).rejects.toThrow(BadRequestException);

      expect(mockQueryRunner.manager.create).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).not.toHaveBeenCalled();
      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('should rollback the DB transaction and rethrow if BullMQ scheduling fails', async () => {
      const mockDto = createCreateAuctionDtoFixture();
      const mockAuction = createAuctionFixture();
      const savedAuction = { ...mockAuction, id: 1 };
      const schedulingError = new Error('BullMQ connection failed');

      mockQueryRunner.manager.create.mockReturnValue(mockAuction);
      mockQueryRunner.manager.save.mockResolvedValue(savedAuction);
      auctionScheduler.scheduleAuctionStart.mockRejectedValue(schedulingError);

      await expect(service.createAuction(mockDto, 1)).rejects.toThrow(schedulingError);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();

      expect(auctionsRepository.update).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback the DB transaction and rethrow if the DB save itself fails', async () => {
      const mockDto = createCreateAuctionDtoFixture();
      const mockAuction = createAuctionFixture();
      const dbError = new Error('DB write failed');

      mockQueryRunner.manager.create.mockReturnValue(mockAuction);
      mockQueryRunner.manager.save.mockRejectedValue(dbError);

      await expect(service.createAuction(mockDto, 1)).rejects.toThrow(dbError);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(auctionScheduler.scheduleAuctionStart).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('findActiveAuctions', () => {
    let mockQuery: GetAuctionsQueryDto;

    beforeEach(() => {
      mockQuery = new GetAuctionsQueryDto();
      mockQuery.page = 1;
      mockQuery.limit = 10;
    });

    it('should return cached data without hitting the database when cache hit', async () => {
      const cachedData = new PaginatorResponse();
      redisService.getCache.mockResolvedValue(cachedData);

      const result = await service.findActiveAuctions(mockQuery);

      expect(redisService.getCache).toHaveBeenCalledWith('auctions:active:1:10');
      expect(result).toBe(cachedData);
      expect(auctionsRepository.findActiveAuctions).not.toHaveBeenCalled();
    });

    it('should fetch from database and populate cache when cache miss', async () => {
      redisService.getCache.mockResolvedValue(null);
      auctionsRepository.findActiveAuctions.mockResolvedValue([[createAuctionFixture()], 1]);

      const result = await service.findActiveAuctions(mockQuery);

      expect(auctionsRepository.findActiveAuctions).toHaveBeenCalledWith(
        0,
        10,
        expect.objectContaining({ search: undefined, category: undefined, minPrice: undefined, maxPrice: undefined }),
      );
      expect(redisService.setCache).toHaveBeenCalledWith('auctions:active:1:10', expect.any(Object), 30);
      expect(result.items).toBeInstanceOf(Array);
      expect(result).toMatchObject({ total: 1, page: 1, limit: 10 });
    });

    it('should use page/limit in cache key for page 2', async () => {
      mockQuery.page = 2;
      redisService.getCache.mockResolvedValue(null);
      auctionsRepository.findActiveAuctions.mockResolvedValue([[createAuctionFixture()], 1]);

      await service.findActiveAuctions(mockQuery);

      expect(redisService.getCache).toHaveBeenCalledWith('auctions:active:2:10');
      expect(auctionsRepository.findActiveAuctions).toHaveBeenCalledWith(10, 10, expect.any(Object));
    });

    it('should include search term in cache key when search is provided', async () => {
      mockQuery.search = 'vintage watch';
      redisService.getCache.mockResolvedValue(null);
      auctionsRepository.findActiveAuctions.mockResolvedValue([[], 0]);

      await service.findActiveAuctions(mockQuery);

      const cacheKeyArg = redisService.getCache.mock.calls[0][0];
      expect(cacheKeyArg).toContain('s=vintage%20watch');
      expect(auctionsRepository.findActiveAuctions).toHaveBeenCalledWith(0, 10, expect.objectContaining({ search: 'vintage watch' }));
    });

    it('should include minPrice and maxPrice in cache key and pass them to repository', async () => {
      mockQuery.minPrice = 100;
      mockQuery.maxPrice = 5000;
      redisService.getCache.mockResolvedValue(null);
      auctionsRepository.findActiveAuctions.mockResolvedValue([[], 0]);

      await service.findActiveAuctions(mockQuery);

      const cacheKeyArg = redisService.getCache.mock.calls[0][0];
      expect(cacheKeyArg).toContain('min=100');
      expect(cacheKeyArg).toContain('max=5000');
      expect(auctionsRepository.findActiveAuctions).toHaveBeenCalledWith(0, 10, expect.objectContaining({ minPrice: 100, maxPrice: 5000 }));
    });

    it('should include category in cache key and pass it to repository', async () => {
      mockQuery.category = AuctionCategory.ELECTRONICS;
      redisService.getCache.mockResolvedValue(null);
      auctionsRepository.findActiveAuctions.mockResolvedValue([[], 0]);

      await service.findActiveAuctions(mockQuery);

      const cacheKeyArg = redisService.getCache.mock.calls[0][0];
      expect(cacheKeyArg).toContain('cat=electronics');
      expect(auctionsRepository.findActiveAuctions).toHaveBeenCalledWith(0, 10, expect.objectContaining({ category: AuctionCategory.ELECTRONICS }));
    });

    it('should include sortBy and sortOrder in cache key when provided', async () => {
      mockQuery.sortBy = AuctionSortBy.END_TIME;
      mockQuery.sortOrder = SortOrder.ASC;
      redisService.getCache.mockResolvedValue(null);
      auctionsRepository.findActiveAuctions.mockResolvedValue([[], 0]);

      await service.findActiveAuctions(mockQuery);

      const cacheKeyArg = redisService.getCache.mock.calls[0][0];
      expect(cacheKeyArg).toContain(`by=${AuctionSortBy.END_TIME}`);
      expect(cacheKeyArg).toContain('ord=ASC');
      expect(auctionsRepository.findActiveAuctions).toHaveBeenCalledWith(0, 10, expect.objectContaining({ sortBy: AuctionSortBy.END_TIME, sortOrder: SortOrder.ASC }));
    });

    it('should map auction list to AuctionResponse instances', async () => {
      const mockAuctions = [createAuctionFixture({ id: 1 }), createAuctionFixture({ id: 2 })];
      redisService.getCache.mockResolvedValue(null);
      auctionsRepository.findActiveAuctions.mockResolvedValue([mockAuctions, 2]);

      const result = await service.findActiveAuctions(mockQuery);

      expect(result.items).toHaveLength(2);
      result.items.forEach((item) => expect(item).toBeInstanceOf(AuctionResponse));
      expect(result.total).toBe(2);
    });
  });

  describe('findMyAuctions', () => {
    let mockPaginator: Paginator;
    let responseSpy: jest.SpyInstance;

    beforeEach(() => {
      mockPaginator = new Paginator();
      mockPaginator.page = 1;
      mockPaginator.limit = 10;
      responseSpy = jest.spyOn(mockPaginator, 'response');
    });

    it('should fetch paginated auctions for an owner and map them to AuctionResponse', async () => {
      const mockUserId = 5;
      const mockAuctions = [createAuctionFixture({ id: 1 }), createAuctionFixture({ id: 2 })];

      auctionsRepository.findPaginatedAuctionsByOwner.mockResolvedValue([mockAuctions, 2]);

      const result = await service.findMyAuctions(mockUserId, mockPaginator);

      expect(auctionsRepository.findPaginatedAuctionsByOwner).toHaveBeenCalledWith(mockUserId, 0, 10);
      expect(responseSpy).toHaveBeenCalledWith(expect.arrayContaining([expect.any(AuctionResponse), expect.any(AuctionResponse)]), 1, 10, 2);
      expect(result.items.length).toBe(2);
      expect(result.items[0]).toBeInstanceOf(AuctionResponse);
    });
  });

  describe('findAuctionBids', () => {
    let mockPaginator: Paginator;
    let responseSpy: jest.SpyInstance;

    beforeEach(() => {
      mockPaginator = new Paginator();
      mockPaginator.page = 1;
      mockPaginator.limit = 10;
      responseSpy = jest.spyOn(mockPaginator, 'response');
    });

    it('should fetch paginated bids for an active auction and map them to BidResponse', async () => {
      const mockAuctionId = 10;
      const mockAuction = createAuctionFixture({ id: mockAuctionId, status: AuctionStatus.ACTIVE });

      const mockBids = [{ id: 1, amount: 200, auctionId: mockAuctionId, userId: 2 }] as any[];

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      bidRepository.findPaginatedBidByAuction.mockResolvedValue([mockBids, 1]);

      const result = await service.findAuctionBids(mockAuctionId, mockPaginator);

      expect(auctionsRepository.findOneBy).toHaveBeenCalledWith({ id: mockAuctionId });
      expect(bidRepository.findPaginatedBidByAuction).toHaveBeenCalledWith(mockAuctionId, 0, 10);
      expect(result.items.length).toBe(1);
      expect(responseSpy).toHaveBeenCalledWith(expect.any(Array), 1, 10, 1);
    });

    it('should throw NotFoundException if auction does not exist', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(null);

      await expect(service.findAuctionBids(1, mockPaginator)).rejects.toThrow(NotFoundException);
      expect(bidRepository.findPaginatedBidByAuction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if auction is CANCELED and requesting user is NOT the owner', async () => {
      const mockAuction = createAuctionFixture({ id: 10, status: AuctionStatus.CANCELED, ownerId: 1 });
      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);

      await expect(service.findAuctionBids(10, mockPaginator, 2)).rejects.toThrow(NotFoundException);
      expect(bidRepository.findPaginatedBidByAuction).not.toHaveBeenCalled();
    });

    it('should return bids if auction is CANCELED but requesting user IS the owner', async () => {
      const mockAuctionId = 10;
      const mockOwnerId = 1;
      const mockAuction = createAuctionFixture({ id: mockAuctionId, status: AuctionStatus.CANCELED, ownerId: mockOwnerId });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      bidRepository.findPaginatedBidByAuction.mockResolvedValue([[], 0]);

      await service.findAuctionBids(mockAuctionId, mockPaginator, mockOwnerId);

      expect(bidRepository.findPaginatedBidByAuction).toHaveBeenCalledWith(mockAuctionId, 0, 10);
      expect(responseSpy).toHaveBeenCalledWith([], 1, 10, 0);
    });
  });

  describe('findOne', () => {
    it('should override database price with Redis live price when auction is ACTIVE and Redis key exists', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.ACTIVE }));
      redisService.getLivePrice.mockResolvedValue(150);
      redisService.isAuctionActive.mockResolvedValue(true);

      const result = await service.findOne(1);

      expect(auctionsRepository.findByIdWithRelations).toHaveBeenCalledWith(1);
      expect(redisService.getLivePrice).toHaveBeenCalledWith(1);
      expect(redisService.isAuctionActive).toHaveBeenCalledWith(1);
      expect(result).toBeInstanceOf(AuctionDetailResponse);
      expect(result.currentPrice).toBe(150);
    });

    it('should return database price when auction is ACTIVE but Redis active key is already gone (cleanup race)', async () => {
      const fixture = createAuctionFixture({ status: AuctionStatus.ACTIVE, currentPrice: 100 });
      auctionsRepository.findByIdWithRelations.mockResolvedValue(fixture);
      redisService.getLivePrice.mockResolvedValue(200);
      redisService.isAuctionActive.mockResolvedValue(false);

      const result = await service.findOne(1);

      expect(result.currentPrice).toBe(100);
    });

    it('should return database price when auction is ACTIVE but live price is null in Redis', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.ACTIVE }));
      redisService.getLivePrice.mockResolvedValue(null);
      redisService.isAuctionActive.mockResolvedValue(true);

      const result = await service.findOne(1);

      expect(result.currentPrice).toBe(100);
    });

    it('should never call Redis for ENDED auctions — DB value is always authoritative', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.ENDED }));

      await service.findOne(1);

      expect(redisService.getLivePrice).not.toHaveBeenCalled();
      expect(redisService.isAuctionActive).not.toHaveBeenCalled();
    });

    it('should never call Redis for PENDING auctions', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.PENDING }));

      await service.findOne(1);

      expect(redisService.getLivePrice).not.toHaveBeenCalled();
      expect(redisService.isAuctionActive).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when auction does not exist', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(null);

      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
      expect(redisService.getLivePrice).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when auction is CANCELED and requesting user is not the owner', async () => {
      const canceledAuction = createAuctionFixture({ status: AuctionStatus.CANCELED, ownerId: 1 });
      auctionsRepository.findByIdWithRelations.mockResolvedValue(canceledAuction);

      await expect(service.findOne(canceledAuction.id, 2)).rejects.toThrow(NotFoundException);
      expect(redisService.getLivePrice).not.toHaveBeenCalled();
    });

    it('should return canceled auction when requesting user is the owner', async () => {
      const canceledAuction = createAuctionFixture({ status: AuctionStatus.CANCELED, ownerId: 1 });
      auctionsRepository.findByIdWithRelations.mockResolvedValue(canceledAuction);

      const result = await service.findOne(canceledAuction.id, 1);

      expect(result).toBeInstanceOf(AuctionDetailResponse);
      expect(redisService.getLivePrice).not.toHaveBeenCalled();
    });
  });

  describe('cancelAuction', () => {
    /**
     * Helper that wires up dataSource.transaction to call the callback
     * with a mock EntityManager (mockManager).
     */
    const mockTransactionWith = (auctionInTx: ReturnType<typeof createAuctionFixture> | null, bidCount = 0) => {
      mockManager.findOne.mockResolvedValue(auctionInTx);
      mockManager.count.mockResolvedValue(bidCount);
      mockManager.save.mockImplementation((_entity: unknown, obj: unknown) => obj);

      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: (em: typeof mockManager) => Promise<unknown>) => cb(mockManager));
    };

    it('should cancel a PENDING auction inside a transaction, cancel start job, and invalidate caches', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.PENDING, ownerId: 1 });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);

      mockTransactionWith(mockAuction);
      auctionScheduler.cancelAuctionStart.mockResolvedValue(undefined);

      const result = await service.cancelAuction(1, 1);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(mockManager.findOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
      expect(mockManager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: AuctionStatus.CANCELED }));
      expect(auctionScheduler.cancelAuctionStart).toHaveBeenCalledWith(1);
      expect(auctionScheduler.cancelAuctionEnd).not.toHaveBeenCalled();
      expect(redisService.cleanupAuction).not.toHaveBeenCalled();
      expect(redisService.invalidateCache).toHaveBeenCalledWith('auctions:active:*');
      expect(redisService.deleteCache).toHaveBeenCalledWith('auction:1:price');
      expect(result).toBeInstanceOf(AuctionResponse);
    });

    it('should cancel an ACTIVE auction with no bids, cancel end job, clean Redis, and invalidate caches', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      mockTransactionWith(mockAuction, 0);
      auctionScheduler.cancelAuctionEnd.mockResolvedValue(undefined);
      redisService.cleanupAuction.mockResolvedValue(undefined);

      const result = await service.cancelAuction(1, 1);

      expect(mockManager.count).toHaveBeenCalled();
      expect(mockManager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: AuctionStatus.CANCELED }));
      expect(auctionScheduler.cancelAuctionEnd).toHaveBeenCalledWith(1);
      expect(auctionScheduler.cancelAuctionStart).not.toHaveBeenCalled();
      expect(redisService.cleanupAuction).toHaveBeenCalledWith(1);
      expect(result).toBeInstanceOf(AuctionResponse);
    });

    it('should throw NotFoundException when auction does not exist in the pre-check', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(null);

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(NotFoundException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when requesting user is not the owner', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture({ ownerId: 2 }));

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(ForbiddenException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when auction status is not ACTIVE or PENDING in the pre-check', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.ENDED, ownerId: 1 }));

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when status changed to ENDED inside the transaction (re-validation under lock)', async () => {
      const preCheckAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });

      const txAuction = createAuctionFixture({ status: AuctionStatus.ENDED, ownerId: 1 });
      auctionsRepository.findOneBy.mockResolvedValue(preCheckAuction);
      mockTransactionWith(txAuction);

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(BadRequestException);
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(auctionScheduler.cancelAuctionEnd).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when an ACTIVE auction has bids placed inside the transaction (TOCTOU guard)', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);

      mockTransactionWith(mockAuction, 1);

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(BadRequestException);
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(auctionScheduler.cancelAuctionEnd).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when auction disappears between pre-check and transaction lock', async () => {
      const preCheckAuction = createAuctionFixture({ status: AuctionStatus.PENDING, ownerId: 1 });
      auctionsRepository.findOneBy.mockResolvedValue(preCheckAuction);

      mockTransactionWith(null);

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(NotFoundException);
      expect(mockManager.save).not.toHaveBeenCalled();
    });
  });

  describe('updateAuction', () => {
    /**
     * Helper that wires up dataSource.transaction to call the callback
     * with a mock EntityManager (mockManager).
     */
    const mockTransactionWith = (auctionInTx: ReturnType<typeof createAuctionFixture> | null, bidCount = 0) => {
      mockManager.findOne.mockResolvedValue(auctionInTx);
      mockManager.count.mockResolvedValue(bidCount);
      mockManager.save.mockImplementation((_entity: unknown, obj: unknown) => obj);

      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: (em: typeof mockManager) => Promise<unknown>) => cb(mockManager));
    };

    it('should update title and description without touching schedule if endTime is not provided', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      const updateDto = createUpdateAuctionDtoFixture({ endTime: undefined, title: 'New Title' });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionsRepository.save.mockResolvedValue({ ...mockAuction, title: 'New Title' });

      const result = await service.updateAuction(1, updateDto, 1);

      expect(auctionsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Title' }));
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(auctionScheduler.cancelAuctionEnd).not.toHaveBeenCalled();
      expect(auctionScheduler.scheduleAuctionEnd).not.toHaveBeenCalled();
      expect(redisService.extendAuctionTime).not.toHaveBeenCalled();
      expect(redisService.invalidateCache).toHaveBeenCalledWith('auctions:active:*');
      expect(result).toBeInstanceOf(AuctionResponse);
    });

    it('should update endTime for an ACTIVE auction with no bids inside a transaction with pessimistic lock and update BullMQ/Redis', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      const futureDate = new Date(mockAuction.endTime.getTime() + 60 * 60 * 1000);
      const updateDto = createUpdateAuctionDtoFixture({ endTime: futureDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      mockTransactionWith({ ...mockAuction, status: AuctionStatus.ACTIVE }, 0);

      auctionScheduler.cancelAuctionEnd.mockResolvedValue(undefined);
      auctionScheduler.scheduleAuctionEnd.mockResolvedValue(undefined);
      redisService.extendAuctionTime.mockResolvedValue(undefined);

      await service.updateAuction(1, updateDto, 1);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(mockManager.findOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
      expect(mockManager.count).toHaveBeenCalled();
      expect(mockManager.save).toHaveBeenCalled();
      expect(auctionsRepository.save).not.toHaveBeenCalled();
      expect(auctionScheduler.cancelAuctionEnd).toHaveBeenCalledWith(1);
      expect(auctionScheduler.scheduleAuctionEnd).toHaveBeenCalledWith(1, futureDate);
      expect(redisService.extendAuctionTime).toHaveBeenCalledWith(1, expect.any(Number));
    });

    it('should update endTime for a PENDING auction without a transaction and without touching BullMQ/Redis', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.PENDING, ownerId: 1 });
      const futureDate = new Date(mockAuction.endTime.getTime() + 60 * 60 * 1000);
      const updateDto = createUpdateAuctionDtoFixture({ endTime: futureDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionsRepository.save.mockResolvedValue({ ...mockAuction, endTime: futureDate });

      await service.updateAuction(1, updateDto, 1);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(auctionsRepository.save).toHaveBeenCalled();
      expect(auctionScheduler.cancelAuctionEnd).not.toHaveBeenCalled();
      expect(auctionScheduler.scheduleAuctionEnd).not.toHaveBeenCalled();
      expect(redisService.extendAuctionTime).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when an ACTIVE auction has bids inside the transaction (TOCTOU guard)', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      const futureDate = new Date(mockAuction.endTime.getTime() + 60 * 60 * 1000);
      const updateDto = createUpdateAuctionDtoFixture({ endTime: futureDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      mockTransactionWith({ ...mockAuction, status: AuctionStatus.ACTIVE }, 3);

      await expect(service.updateAuction(1, updateDto, 1)).rejects.toThrow(BadRequestException);

      expect(mockManager.count).toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(auctionsRepository.save).not.toHaveBeenCalled();
      expect(auctionScheduler.cancelAuctionEnd).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when auction status changed to non-ACTIVE inside the transaction (status drift)', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      const futureDate = new Date(mockAuction.endTime.getTime() + 60 * 60 * 1000);
      const updateDto = createUpdateAuctionDtoFixture({ endTime: futureDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      mockTransactionWith({ ...mockAuction, status: AuctionStatus.ENDED }, 0);

      await expect(service.updateAuction(1, updateDto, 1)).rejects.toThrow(BadRequestException);

      expect(mockManager.count).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when auction disappears between pre-check and transaction lock', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      const futureDate = new Date(mockAuction.endTime.getTime() + 60 * 60 * 1000);
      const updateDto = createUpdateAuctionDtoFixture({ endTime: futureDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      mockTransactionWith(null, 0);

      await expect(service.updateAuction(1, updateDto, 1)).rejects.toThrow(NotFoundException);

      expect(mockManager.count).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when auction does not exist', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(null);

      await expect(service.updateAuction(1, createUpdateAuctionDtoFixture(), 1)).rejects.toThrow(NotFoundException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when requesting user is not the owner', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture({ ownerId: 1 }));

      await expect(service.updateAuction(1, createUpdateAuctionDtoFixture(), 2)).rejects.toThrow(ForbiddenException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when auction status is CANCELED or ENDED', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.CANCELED, ownerId: 1 }));

      await expect(service.updateAuction(1, createUpdateAuctionDtoFixture(), 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when new endTime is in the past', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.PENDING, ownerId: 1 });
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const invalidDto = createUpdateAuctionDtoFixture({ endTime: pastDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);

      await expect(service.updateAuction(1, invalidDto, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when new endTime is not later than current endTime', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.PENDING, ownerId: 1 });
      const invalidDate = new Date(mockAuction.endTime.getTime() - 1000);
      const invalidDto = createUpdateAuctionDtoFixture({ endTime: invalidDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);

      await expect(service.updateAuction(1, invalidDto, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when new endTime equals current endTime', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.PENDING, ownerId: 1 });
      const invalidDto = createUpdateAuctionDtoFixture({ endTime: mockAuction.endTime.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);

      await expect(service.updateAuction(1, invalidDto, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should save auction without changes when DTO contains no fields', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      const emptyDto = createUpdateAuctionDtoFixture({ title: undefined, description: undefined, endTime: undefined });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionsRepository.save.mockResolvedValue(mockAuction);

      const result = await service.updateAuction(1, emptyDto, 1);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(auctionsRepository.save).toHaveBeenCalledWith(mockAuction);
      expect(auctionScheduler.cancelAuctionEnd).not.toHaveBeenCalled();
      expect(auctionScheduler.scheduleAuctionEnd).not.toHaveBeenCalled();
      expect(redisService.extendAuctionTime).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(AuctionResponse);
    });
  });

  describe('updateAuctionImages', () => {
    const mockI18n = { t: jest.fn().mockReturnValue('Translated error') } as unknown as I18nContext;

    const mockUploadOptions = {
      maxSizeMB: 5,
      allowedTypes: ['image/jpeg', 'image/png'],
      subDir: 'auctions',
    };

    const mockUploadedFile = {
      url: '/uploads/new.jpg',
      path: '/uploads/new.jpg',
      filename: 'new.jpg',
      size: 12345,
      mimetype: 'image/jpeg',
    } as IUploadedFile;

    beforeEach(() => {
      bidRepository.count.mockResolvedValue(0);
    });

    it('should throw NotFoundException when auction does not exist', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(null);

      await expect(service.updateAuctionImages(1, 1, [], ['/uploads/any.jpg'], 0, mockI18n)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when requesting user is not the owner', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture({ ownerId: 1 }));

      await expect(service.updateAuctionImages(1, 2, createMockFilesFixture(1), [], 0, mockI18n)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when auction status is not ACTIVE', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.CANCELED }));

      await expect(service.updateAuctionImages(1, 1, createMockFilesFixture(1), [], 0, mockI18n)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when neither files nor existing URLs are provided', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture());

      await expect(service.updateAuctionImages(1, 1, [], [], undefined, mockI18n)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when provided existing URL does not belong to the auction', async () => {
      const mockAuction = createAuctionFixture();
      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionImageRepository.find.mockResolvedValue([createAuctionImageFixture({ auction: mockAuction, imageUrl: '/uploads/valid.jpg' })]);

      await expect(service.updateAuctionImages(1, 1, [], ['/uploads/not-mine.jpg'], undefined, mockI18n)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when total image count exceeds 10', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture());
      auctionImageRepository.find.mockResolvedValue([]);

      await expect(service.updateAuctionImages(1, 1, createMockFilesFixture(11), [], undefined, mockI18n)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when primaryImageIndex is out of bounds', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture());
      auctionImageRepository.find.mockResolvedValue([]);
      fileUploadService.uploadMultiple.mockResolvedValue([mockUploadedFile]);
      fileUploadService.getAuctionImageUploadOptions.mockReturnValue(mockUploadOptions);

      await expect(service.updateAuctionImages(1, 1, createMockFilesFixture(1), [], 5, mockI18n)).rejects.toThrow(BadRequestException);
    });

    it('should upload new files, run transaction, and invalidate cache on success', async () => {
      const mockAuction = createAuctionFixture();
      const existingImage = createAuctionImageFixture({ auction: mockAuction, imageUrl: '/uploads/existing.jpg' });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionImageRepository.find.mockResolvedValue([existingImage]);
      fileUploadService.uploadMultiple.mockResolvedValue([mockUploadedFile]);
      fileUploadService.getAuctionImageUploadOptions.mockReturnValue(mockUploadOptions);

      auctionsRepository.manager.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (manager: typeof mockManager) => Promise<unknown>;
        return cb(mockManager);
      });

      await service.updateAuctionImages(1, 1, createMockFilesFixture(1), ['/uploads/existing.jpg'], 0, mockI18n);

      expect(fileUploadService.uploadMultiple).toHaveBeenCalledWith(expect.any(Array), mockUploadOptions, mockI18n);
      expect(auctionsRepository.manager.transaction).toHaveBeenCalled();
      expect(redisService.invalidateCache).toHaveBeenCalledWith('auctions:active:*');
    });

    it('should delete removed images from disk after successful transaction', async () => {
      const mockAuction = createAuctionFixture();
      const imageToDelete = createAuctionImageFixture({ auction: mockAuction, imageUrl: '/uploads/old.jpg' });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionImageRepository.find.mockResolvedValue([imageToDelete]);
      fileUploadService.uploadMultiple.mockResolvedValue([mockUploadedFile]);
      fileUploadService.getAuctionImageUploadOptions.mockReturnValue(mockUploadOptions);

      auctionsRepository.manager.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (manager: typeof mockManager) => Promise<unknown>;
        return cb(mockManager);
      });

      await service.updateAuctionImages(1, 1, createMockFilesFixture(1), [], 0, mockI18n);

      expect(fileUploadService.deleteFiles).toHaveBeenCalledWith(['old.jpg']);
    });

    it('should not call uploadMultiple when no new files are provided', async () => {
      const mockAuction = createAuctionFixture();
      const existingImage = createAuctionImageFixture({ auction: mockAuction, imageUrl: '/uploads/keep.jpg' });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionImageRepository.find.mockResolvedValue([existingImage]);

      auctionsRepository.manager.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (manager: typeof mockManager) => Promise<unknown>;
        return cb(mockManager);
      });

      await service.updateAuctionImages(1, 1, [], ['/uploads/keep.jpg'], 0, mockI18n);

      expect(fileUploadService.uploadMultiple).not.toHaveBeenCalled();
    });

    it('should rollback uploaded files and throw BadRequestException when transaction fails', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture());
      auctionImageRepository.find.mockResolvedValue([]);
      fileUploadService.uploadMultiple.mockResolvedValue([mockUploadedFile]);
      fileUploadService.getAuctionImageUploadOptions.mockReturnValue(mockUploadOptions);
      auctionsRepository.manager.transaction.mockRejectedValue(new Error('DB Error'));

      await expect(service.updateAuctionImages(1, 1, createMockFilesFixture(1), [], 0, mockI18n)).rejects.toThrow(BadRequestException);

      expect(fileUploadService.deleteFiles).toHaveBeenCalledWith(['new.jpg']);
    });

    it('should still throw BadRequestException even when rollback file deletion also fails', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture());
      auctionImageRepository.find.mockResolvedValue([]);
      fileUploadService.uploadMultiple.mockResolvedValue([mockUploadedFile]);
      fileUploadService.getAuctionImageUploadOptions.mockReturnValue(mockUploadOptions);
      auctionsRepository.manager.transaction.mockRejectedValue(new Error('DB Error'));
      fileUploadService.deleteFiles.mockRejectedValue(new Error('Disk error'));

      await expect(service.updateAuctionImages(1, 1, createMockFilesFixture(1), [], 0, mockI18n)).rejects.toThrow(BadRequestException);
    });

    it('should update isPrimary flags and auction mainImageUrl when primaryImageIndex changes among existing images', async () => {
      const mockAuction = createAuctionFixture({ mainImageUrl: '/uploads/img1.jpg' });
      const img1 = createAuctionImageFixture({ id: 1, auction: mockAuction, imageUrl: '/uploads/img1.jpg', isPrimary: true });
      const img2 = createAuctionImageFixture({ id: 2, auction: mockAuction, imageUrl: '/uploads/img2.jpg', isPrimary: false });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionImageRepository.find.mockResolvedValue([img1, img2]);

      auctionsRepository.manager.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (manager: typeof mockManager) => Promise<unknown>;
        return cb(mockManager);
      });

      await service.updateAuctionImages(1, 1, [], ['/uploads/img1.jpg', '/uploads/img2.jpg'], 1, mockI18n);

      expect(auctionsRepository.manager.transaction).toHaveBeenCalled();
      expect(mockManager.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException on transaction failure without attempting to delete files if NONE were uploaded', async () => {
      const mockAuction = createAuctionFixture();
      const existingImage = createAuctionImageFixture({ auction: mockAuction, imageUrl: '/uploads/keep.jpg' });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionImageRepository.find.mockResolvedValue([existingImage]);

      auctionsRepository.manager.transaction.mockRejectedValue(new Error('DB Error'));

      await expect(service.updateAuctionImages(1, 1, [], ['/uploads/keep.jpg'], 0, mockI18n)).rejects.toThrow(BadRequestException);

      expect(fileUploadService.uploadMultiple).not.toHaveBeenCalled();
      expect(fileUploadService.deleteFiles).not.toHaveBeenCalled();
    });

    it('should skip deleting removed images from disk if there are none to delete', async () => {
      const mockAuction = createAuctionFixture();
      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionImageRepository.find.mockResolvedValue([]);

      fileUploadService.uploadMultiple.mockResolvedValue([mockUploadedFile]);
      fileUploadService.getAuctionImageUploadOptions.mockReturnValue(mockUploadOptions);

      auctionsRepository.manager.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (manager: typeof mockManager) => Promise<unknown>;
        return cb(mockManager);
      });

      await service.updateAuctionImages(1, 1, createMockFilesFixture(1), [], 0, mockI18n);

      expect(fileUploadService.deleteFiles).not.toHaveBeenCalled();
    });

    it('should log an error and not fail the request if deleting old images from disk fails after a successful transaction', async () => {
      const mockAuction = createAuctionFixture();
      const imageToDelete = createAuctionImageFixture({ auction: mockAuction, imageUrl: '/uploads/old.jpg' });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionImageRepository.find.mockResolvedValue([imageToDelete]);

      fileUploadService.uploadMultiple.mockResolvedValue([mockUploadedFile]);
      fileUploadService.getAuctionImageUploadOptions.mockReturnValue(mockUploadOptions);

      auctionsRepository.manager.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (manager: typeof mockManager) => Promise<unknown>;
        return cb(mockManager);
      });

      const diskError = new Error('Permission denied on disk');
      fileUploadService.deleteFiles.mockRejectedValue(diskError);

      await service.updateAuctionImages(1, 1, createMockFilesFixture(1), [], 0, mockI18n);

      expect(fileUploadService.deleteFiles).toHaveBeenCalledWith(expect.arrayContaining(['old.jpg']));
      expect(Logger.prototype.error).toHaveBeenCalledWith(`Failed to delete old auction images from disk for auction 1`, diskError);
    });
  });
});
