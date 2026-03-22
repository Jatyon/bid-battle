import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Paginator, PaginatorResponse } from '@core/models';
import { Repository } from 'typeorm';
import { I18nContext } from 'nestjs-i18n';
import { Bid } from '@modules/bid';
import { FileUploadService, IUploadedFile } from '@shared/file-upload';
import { RedisService } from '@shared/redis';
import {
  createAuctionFixture,
  createCreateAuctionDtoFixture,
  createUpdateAuctionDtoFixture,
  createAuctionImageFixture,
  createMockFilesFixture,
} from '@test/fixtures/auctions.fixtures';
import { AuctionsRepository } from './repositories/auctions.repository';
import { AuctionResponse, AuctionDetailResponse } from './dto';
import { AuctionScheduler } from './auction.scheduler';
import { AuctionsService } from './auctions.service';
import { AuctionImage } from './entities';
import { AuctionStatus } from './enums';
import { createMock, DeepMocked } from '@golevelup/ts-jest';

describe('AuctionsService', () => {
  let service: AuctionsService;
  let auctionsRepository: DeepMocked<AuctionsRepository>;
  let auctionImageRepository: DeepMocked<Repository<AuctionImage>>;
  let bidRepository: DeepMocked<Repository<Bid>>;
  let redisService: DeepMocked<RedisService>;
  let fileUploadService: DeepMocked<FileUploadService>;
  let auctionScheduler: DeepMocked<AuctionScheduler>;

  const mockManager = { delete: jest.fn(), save: jest.fn() };

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
          provide: getRepositoryToken(Bid),
          useValue: createMock<Repository<Bid>>(),
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
      ],
    }).compile();

    service = module.get<AuctionsService>(AuctionsService);
    auctionsRepository = module.get(AuctionsRepository);
    auctionImageRepository = module.get(getRepositoryToken(AuctionImage));
    bidRepository = module.get(getRepositoryToken(Bid));
    redisService = module.get(RedisService);
    fileUploadService = module.get(FileUploadService);
    auctionScheduler = module.get(AuctionScheduler);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('createAuction', () => {
    it('should create auction successfully with status PENDING and schedule it', async () => {
      const mockDto = createCreateAuctionDtoFixture();
      const mockAuction = createAuctionFixture();
      const savedAuction = { ...mockAuction, id: 1 };

      auctionsRepository.create.mockReturnValue(mockAuction);
      auctionsRepository.save.mockResolvedValue(savedAuction);
      auctionScheduler.scheduleAuctionStart.mockResolvedValue(undefined);

      const result = await service.createAuction(mockDto, 1);

      expect(auctionsRepository.create).toHaveBeenCalledWith(
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

      expect(auctionsRepository.save).toHaveBeenCalledWith(mockAuction);

      expect(auctionScheduler.scheduleAuctionStart).toHaveBeenCalledWith(savedAuction.id, expect.any(Date));

      expect(result).toBeInstanceOf(AuctionResponse);
    });

    it('should set correct primary image when primaryImageIndex is provided', async () => {
      const mockDto = createCreateAuctionDtoFixture({ primaryImageIndex: 1 });
      const mockAuction = createAuctionFixture();

      auctionsRepository.create.mockReturnValue(mockAuction);
      auctionsRepository.save.mockResolvedValue({ ...mockAuction, id: 1 });
      auctionScheduler.scheduleAuctionStart.mockResolvedValue(undefined);

      await service.createAuction(mockDto, 1);

      expect(auctionsRepository.create).toHaveBeenCalledWith(
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

      auctionsRepository.create.mockReturnValue(mockAuction);
      auctionsRepository.save.mockResolvedValue({ ...mockAuction, id: 1 });
      auctionScheduler.scheduleAuctionStart.mockResolvedValue(undefined);

      await service.createAuction(dtoWithoutIndex, 1);

      expect(auctionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mainImageUrl: dtoWithoutIndex.imageUrls[0],
        }),
      );
    });

    it('should throw BadRequestException when primaryImageIndex is out of bounds', async () => {
      const invalidDto = createCreateAuctionDtoFixture({ primaryImageIndex: 5 });

      await expect(service.createAuction(invalidDto, 1)).rejects.toThrow(BadRequestException);

      expect(auctionsRepository.create).not.toHaveBeenCalled();
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should rollback auction to CANCELED status if BullMQ scheduling fails', async () => {
      const mockDto = createCreateAuctionDtoFixture();
      const mockAuction = createAuctionFixture();
      const savedAuction = { ...mockAuction, id: 1 };
      const schedulingError = new Error('BullMQ connection failed');

      auctionsRepository.create.mockReturnValue(mockAuction);
      auctionsRepository.save.mockResolvedValue(savedAuction);

      auctionScheduler.scheduleAuctionStart.mockRejectedValue(schedulingError);
      auctionsRepository.update.mockResolvedValue({
        raw: [],
        generatedMaps: [],
        affected: 1,
      });

      await expect(service.createAuction(mockDto, 1)).rejects.toThrow(schedulingError);

      expect(auctionsRepository.update).toHaveBeenCalledWith(savedAuction.id, {
        status: AuctionStatus.CANCELED,
      });
    });
  });

  describe('findActiveAuctions', () => {
    let mockPaginator: Paginator;

    beforeEach(() => {
      mockPaginator = new Paginator();
      mockPaginator.page = 1;
      mockPaginator.limit = 10;
    });

    it('should return cached data for first page without hitting the database', async () => {
      const cachedData = new PaginatorResponse();
      redisService.getCache.mockResolvedValue(cachedData);

      const result = await service.findActiveAuctions(mockPaginator);

      expect(redisService.getCache).toHaveBeenCalledWith('auctions:active:1:10');
      expect(result).toBe(cachedData);
      expect(auctionsRepository.findActiveAuctions).not.toHaveBeenCalled();
    });

    it('should fetch from database and populate cache when first page has no cache', async () => {
      redisService.getCache.mockResolvedValue(null);
      auctionsRepository.findActiveAuctions.mockResolvedValue([[createAuctionFixture()], 1]);

      const result = await service.findActiveAuctions(mockPaginator);

      expect(auctionsRepository.findActiveAuctions).toHaveBeenCalledWith(0, 10);
      expect(redisService.setCache).toHaveBeenCalledWith('auctions:active:1:10', expect.any(PaginatorResponse), 30);
      expect(result).toBeInstanceOf(PaginatorResponse);
    });

    it('should skip cache check and not cache result for pages other than first', async () => {
      mockPaginator.page = 2;
      auctionsRepository.findActiveAuctions.mockResolvedValue([[createAuctionFixture()], 1]);

      await service.findActiveAuctions(mockPaginator);

      expect(redisService.getCache).not.toHaveBeenCalled();
      expect(auctionsRepository.findActiveAuctions).toHaveBeenCalledWith(10, 10);
      expect(redisService.setCache).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should override database price with Redis live price when cache exists', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture());
      redisService.getLivePrice.mockResolvedValue(150);

      const result = await service.findOne(1);

      expect(auctionsRepository.findByIdWithRelations).toHaveBeenCalledWith(1);
      expect(redisService.getLivePrice).toHaveBeenCalledWith(1);
      expect(result).toBeInstanceOf(AuctionDetailResponse);
      expect(result.currentPrice).toBe(150);
    });

    it('should return database price when no live price in Redis', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture());
      redisService.getLivePrice.mockResolvedValue(null);

      const result = await service.findOne(1);

      expect(result.currentPrice).toBe(100);
    });

    it('should throw NotFoundException when auction does not exist', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(null);

      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
      expect(redisService.getLivePrice).not.toHaveBeenCalled();
    });
  });

  describe('cancelAuction', () => {
    it('should cancel a PENDING auction, cancel start job, and invalidate caches', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.PENDING, ownerId: 1 });
      auctionsRepository.findByIdWithRelations.mockResolvedValue(mockAuction);
      auctionsRepository.save.mockResolvedValue({ ...mockAuction, status: AuctionStatus.CANCELED });

      auctionScheduler.cancelAuctionStart.mockResolvedValue(undefined);

      const result = await service.cancelAuction(1, 1);

      expect(auctionsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: AuctionStatus.CANCELED }));
      expect(auctionScheduler.cancelAuctionStart).toHaveBeenCalledWith(1);
      expect(auctionScheduler.cancelAuctionEnd).not.toHaveBeenCalled();
      expect(redisService.cleanupAuction).not.toHaveBeenCalled();
      expect(redisService.invalidateCache).toHaveBeenCalledWith('auctions:active:*');
      expect(redisService.deleteCache).toHaveBeenCalledWith('auction:1:price');
      expect(result).toBeInstanceOf(AuctionResponse);
    });

    it('should cancel an ACTIVE auction with no bids, cancel end job, clean Redis, and invalidate caches', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      auctionsRepository.findByIdWithRelations.mockResolvedValue(mockAuction);
      bidRepository.count.mockResolvedValue(0);
      auctionsRepository.save.mockResolvedValue({ ...mockAuction, status: AuctionStatus.CANCELED });

      auctionScheduler.cancelAuctionEnd.mockResolvedValue(undefined);
      redisService.cleanupAuction.mockResolvedValue(undefined);

      const result = await service.cancelAuction(1, 1);

      expect(bidRepository.count).toHaveBeenCalledWith({ where: { auctionId: 1 } });
      expect(auctionsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: AuctionStatus.CANCELED }));
      expect(auctionScheduler.cancelAuctionEnd).toHaveBeenCalledWith(1);
      expect(auctionScheduler.cancelAuctionStart).not.toHaveBeenCalled();
      expect(redisService.cleanupAuction).toHaveBeenCalledWith(1);
      expect(result).toBeInstanceOf(AuctionResponse);
    });

    it('should throw NotFoundException when auction does not exist', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(null);

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(NotFoundException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when requesting user is not the owner', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture({ ownerId: 2 }));

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(ForbiddenException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when auction status is not ACTIVE or PENDING', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.ENDED, ownerId: 1 }));

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when an ACTIVE auction already has bids (bidCount > 0)', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      auctionsRepository.findByIdWithRelations.mockResolvedValue(mockAuction);
      bidRepository.count.mockResolvedValue(3);

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
      expect(auctionScheduler.cancelAuctionEnd).not.toHaveBeenCalled();
    });
  });

  describe('updateAuction', () => {
    it('should update title and description without touching schedule if endTime is not provided', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      const updateDto = createUpdateAuctionDtoFixture({ endTime: undefined, title: 'New Title' });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionsRepository.save.mockResolvedValue({ ...mockAuction, title: 'New Title' });

      const result = await service.updateAuction(1, updateDto, 1);

      expect(auctionsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Title' }));
      expect(auctionScheduler.cancelAuctionEnd).not.toHaveBeenCalled();
      expect(auctionScheduler.scheduleAuctionEnd).not.toHaveBeenCalled();
      expect(redisService.extendAuctionTime).not.toHaveBeenCalled();
      expect(redisService.invalidateCache).toHaveBeenCalledWith('auctions:active:*');
      expect(result).toBeInstanceOf(AuctionResponse);
    });

    it('should update endTime for an ACTIVE auction with no bids and update BullMQ/Redis', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      const futureDate = new Date(mockAuction.endTime.getTime() + 60 * 60 * 1000);
      const updateDto = createUpdateAuctionDtoFixture({ endTime: futureDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      bidRepository.count.mockResolvedValue(0);
      auctionsRepository.save.mockResolvedValue({ ...mockAuction, endTime: futureDate });

      auctionScheduler.cancelAuctionEnd.mockResolvedValue(undefined);
      auctionScheduler.scheduleAuctionEnd.mockResolvedValue(undefined);
      redisService.extendAuctionTime.mockResolvedValue(undefined);

      await service.updateAuction(1, updateDto, 1);

      expect(bidRepository.count).toHaveBeenCalledWith({ where: { auctionId: 1 } });
      expect(auctionScheduler.cancelAuctionEnd).toHaveBeenCalledWith(1);
      expect(auctionScheduler.scheduleAuctionEnd).toHaveBeenCalledWith(1, futureDate);
      expect(redisService.extendAuctionTime).toHaveBeenCalledWith(1, expect.any(Number));
    });

    it('should update endTime for a PENDING auction without touching BullMQ/Redis', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.PENDING, ownerId: 1 });
      const futureDate = new Date(mockAuction.endTime.getTime() + 60 * 60 * 1000);
      const updateDto = createUpdateAuctionDtoFixture({ endTime: futureDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionsRepository.save.mockResolvedValue({ ...mockAuction, endTime: futureDate });

      await service.updateAuction(1, updateDto, 1);

      expect(bidRepository.count).not.toHaveBeenCalled();
      expect(auctionScheduler.cancelAuctionEnd).not.toHaveBeenCalled();
      expect(auctionScheduler.scheduleAuctionEnd).not.toHaveBeenCalled();
      expect(redisService.extendAuctionTime).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException (Anti-fraud) when changing endTime of an ACTIVE auction with existing bids', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.ACTIVE, ownerId: 1 });
      const futureDate = new Date(mockAuction.endTime.getTime() + 60 * 60 * 1000);
      const updateDto = createUpdateAuctionDtoFixture({ endTime: futureDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      bidRepository.count.mockResolvedValue(3);

      await expect(service.updateAuction(1, updateDto, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when auction does not exist', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(null);

      await expect(service.updateAuction(1, createUpdateAuctionDtoFixture(), 1)).rejects.toThrow(NotFoundException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when requesting user is not the owner', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture({ ownerId: 1 }));

      await expect(service.updateAuction(1, createUpdateAuctionDtoFixture(), 2)).rejects.toThrow(ForbiddenException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when auction status is CANCELED or ENDED', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.CANCELED, ownerId: 1 }));

      await expect(service.updateAuction(1, createUpdateAuctionDtoFixture(), 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when new endTime is in the past', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.PENDING, ownerId: 1 });
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      const invalidDto = createUpdateAuctionDtoFixture({ endTime: pastDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);

      await expect(service.updateAuction(1, invalidDto, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when new endTime is not later than current endTime', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.PENDING, ownerId: 1 });
      const invalidDate = new Date(mockAuction.endTime.getTime() - 1000);
      const invalidDto = createUpdateAuctionDtoFixture({ endTime: invalidDate.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);

      await expect(service.updateAuction(1, invalidDto, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when new endTime equals current endTime', async () => {
      const mockAuction = createAuctionFixture({ status: AuctionStatus.PENDING, ownerId: 1 });
      const invalidDto = createUpdateAuctionDtoFixture({ endTime: mockAuction.endTime.toISOString() });

      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);

      await expect(service.updateAuction(1, invalidDto, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
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
