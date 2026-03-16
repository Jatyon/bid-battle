import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Paginator, PaginatorResponse } from '@core/models';
import { Repository } from 'typeorm';
import { I18nContext } from 'nestjs-i18n';
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
import { AuctionsService } from './auctions.service';
import { AuctionImage } from './entities';
import { AuctionStatus } from './enums';
import { createMock, DeepMocked } from '@golevelup/ts-jest';

describe('AuctionsService', () => {
  let service: AuctionsService;
  let auctionsRepository: DeepMocked<AuctionsRepository>;
  let auctionImageRepository: DeepMocked<Repository<AuctionImage>>;
  let redisService: DeepMocked<RedisService>;
  let fileUploadService: DeepMocked<FileUploadService>;

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
          provide: RedisService,
          useValue: createMock<RedisService>(),
        },
        {
          provide: FileUploadService,
          useValue: createMock<FileUploadService>(),
        },
      ],
    }).compile();

    service = module.get<AuctionsService>(AuctionsService);
    auctionsRepository = module.get(AuctionsRepository);
    auctionImageRepository = module.get(getRepositoryToken(AuctionImage));
    redisService = module.get(RedisService);
    fileUploadService = module.get(FileUploadService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('createAuction', () => {
    it('should create auction successfully with first image as primary by default', async () => {
      const mockDto = createCreateAuctionDtoFixture();
      const mockAuction = createAuctionFixture();
      const savedAuction = { ...mockAuction, id: 1 };

      auctionsRepository.create.mockReturnValue(mockAuction);
      auctionsRepository.save.mockResolvedValue(savedAuction);

      const result = await service.createAuction(mockDto, 1);

      expect(auctionsRepository.create).toHaveBeenCalledWith({
        title: mockDto.title,
        description: mockDto.description,
        startingPrice: mockDto.startingPrice,
        endTime: mockDto.endTime,
        ownerId: 1,
        currentPrice: mockDto.startingPrice,
        status: AuctionStatus.ACTIVE,
        mainImageUrl: mockDto.imageUrls[0],
        images: expect.arrayContaining([
          { imageUrl: mockDto.imageUrls[0], isPrimary: true },
          { imageUrl: mockDto.imageUrls[1], isPrimary: false },
        ]) as unknown as AuctionImage[],
      });
      expect(result).toBeInstanceOf(AuctionResponse);
    });

    it('should set correct primary image when primaryImageIndex is provided', async () => {
      const mockDto = createCreateAuctionDtoFixture({ primaryImageIndex: 1 });
      const mockAuction = createAuctionFixture();

      auctionsRepository.create.mockReturnValue(mockAuction);
      auctionsRepository.save.mockResolvedValue({ ...mockAuction, id: 1 });

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
    it('should cancel auction and invalidate both list cache and price cache', async () => {
      const mockAuction = createAuctionFixture();
      auctionsRepository.findByIdWithRelations.mockResolvedValue(mockAuction);
      auctionsRepository.save.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.CANCELED }));

      const result = await service.cancelAuction(1, 1);

      expect(auctionsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: AuctionStatus.CANCELED }));
      expect(redisService.invalidateCache).toHaveBeenCalledWith('auctions:active:*');
      expect(redisService.deleteCache).toHaveBeenCalledWith('auction:1:price');
      expect(result).toBeInstanceOf(AuctionResponse);
    });

    it('should throw NotFoundException when auction does not exist', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(null);

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(NotFoundException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when requesting user is not the owner', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture({ ownerId: 1 }));

      await expect(service.cancelAuction(1, 2)).rejects.toThrow(ForbiddenException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when auction status is not ACTIVE', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.CANCELED }));

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when auction already has bids (currentPrice > startingPrice)', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture({ currentPrice: 150, startingPrice: 100 }));

      await expect(service.cancelAuction(1, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should allow cancellation when currentPrice equals startingPrice (no bids edge case)', async () => {
      auctionsRepository.findByIdWithRelations.mockResolvedValue(createAuctionFixture({ currentPrice: 100, startingPrice: 100 }));
      auctionsRepository.save.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.CANCELED }));

      await expect(service.cancelAuction(1, 1)).resolves.toBeInstanceOf(AuctionResponse);
    });
  });

  describe('updateAuction', () => {
    it('should update title, description and endTime successfully', async () => {
      const mockAuction = createAuctionFixture();
      const updateDto = createUpdateAuctionDtoFixture({
        endTime: new Date(mockAuction.endTime.getTime() + 60 * 60 * 1000).toISOString(),
      });
      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);
      auctionsRepository.save.mockResolvedValue({
        ...mockAuction,
        ...updateDto,
        endTime: new Date(updateDto.endTime!),
      });

      const result = await service.updateAuction(1, updateDto, 1);

      expect(auctionsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: updateDto.title,
          description: updateDto.description,
          endTime: expect.any(Date) as unknown as Date,
        }),
      );
      expect(redisService.invalidateCache).toHaveBeenCalledWith('auctions:active:*');
      expect(result).toBeInstanceOf(AuctionResponse);
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

    it('should throw BadRequestException when auction status is not ACTIVE', async () => {
      auctionsRepository.findOneBy.mockResolvedValue(createAuctionFixture({ status: AuctionStatus.CANCELED }));

      await expect(service.updateAuction(1, createUpdateAuctionDtoFixture(), 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when new endTime is not later than current endTime', async () => {
      const mockAuction = createAuctionFixture();
      const invalidDto = createUpdateAuctionDtoFixture({
        endTime: new Date(mockAuction.endTime.getTime() - 1000).toISOString(),
      });
      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);

      await expect(service.updateAuction(1, invalidDto, 1)).rejects.toThrow(BadRequestException);
      expect(auctionsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when new endTime equals current endTime', async () => {
      const mockAuction = createAuctionFixture();
      const invalidDto = createUpdateAuctionDtoFixture({
        endTime: mockAuction.endTime.toISOString(),
      });
      auctionsRepository.findOneBy.mockResolvedValue(mockAuction);

      await expect(service.updateAuction(1, invalidDto, 1)).rejects.toThrow(BadRequestException);
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
