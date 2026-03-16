import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Paginator, PaginatorResponse } from '@core/models';
import { createAuctionResponseFixture, createAuctionDetailResponseFixture, createCreateAuctionDtoFixture, createMockFilesFixture } from '@test/fixtures/auctions.fixtures';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { createMockI18nContext } from '@test/mocks/i18n.mock';
import { FileUploadService, IUploadOptions, IUploadedFile } from '@shared/file-upload';
import { AuctionResponse, UploadAuctionImagesDto, UpdateAuctionDto, UpdateAuctionImagesDto, UploadedFileDto } from './dto';
import { AuctionsController } from './auctions.controller';
import { AuctionsService } from './auctions.service';
import { AuctionStatus } from './enums';
import { createMock, DeepMocked } from '@golevelup/ts-jest';

describe('AuctionsController', () => {
  let controller: AuctionsController;
  let service: DeepMocked<AuctionsService>;
  let fileUploadService: DeepMocked<FileUploadService>;

  const mockUser = createUserFixture();
  const mockI18n = createMockI18nContext();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuctionsController],
      providers: [
        {
          provide: AuctionsService,
          useValue: createMock<AuctionsService>(),
        },
        {
          provide: FileUploadService,
          useValue: createMock<FileUploadService>(),
        },
      ],
    }).compile();

    controller = module.get<AuctionsController>(AuctionsController);
    service = module.get(AuctionsService);
    fileUploadService = module.get(FileUploadService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createAuction', () => {
    it('should call service.createAuction with correct parameters and return the result', async () => {
      const createAuctionDto = createCreateAuctionDtoFixture();
      const mockResponse = createAuctionResponseFixture();

      service.createAuction.mockResolvedValue(mockResponse);

      const result = await controller.createAuction(createAuctionDto, mockUser);

      expect(service.createAuction).toHaveBeenCalledWith(createAuctionDto, mockUser.id);
      expect(result).toBe(mockResponse);
    });

    it('should propagate error thrown by service', async () => {
      const createAuctionDto = createCreateAuctionDtoFixture();

      service.createAuction.mockRejectedValue(new BadRequestException());

      await expect(controller.createAuction(createAuctionDto, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAuctions', () => {
    it('should return paginated auctions', async () => {
      const mockResponse: PaginatorResponse<AuctionResponse> = {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
      };

      service.findActiveAuctions.mockResolvedValue(mockResponse);

      const paginator = new Paginator();
      paginator.page = 1;
      paginator.limit = 10;

      const result = await controller.getAuctions(paginator);

      expect(service.findActiveAuctions).toHaveBeenCalledWith(paginator);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getAuction', () => {
    it('should return auction detail by id', async () => {
      const mockResponse = createAuctionDetailResponseFixture();

      service.findOne.mockResolvedValue(mockResponse);

      const result = await controller.getAuction(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toBe(mockResponse);
    });

    it('should propagate NotFoundException when auction does not exist', async () => {
      service.findOne.mockRejectedValue(new NotFoundException());

      await expect(controller.getAuction(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelAuction', () => {
    it('should cancel auction and return response with CANCELED status', async () => {
      const mockResponse = createAuctionResponseFixture({ status: AuctionStatus.CANCELED });

      service.cancelAuction.mockResolvedValue(mockResponse);

      const result = await controller.cancelAuction(1, mockUser);

      expect(service.cancelAuction).toHaveBeenCalledWith(1, mockUser.id);
      expect(result.status).toBe(AuctionStatus.CANCELED);
    });

    it('should propagate error when cancellation is not allowed', async () => {
      service.cancelAuction.mockRejectedValue(new BadRequestException());

      await expect(controller.cancelAuction(1, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should propagate NotFoundException when auction does not exist', async () => {
      service.cancelAuction.mockRejectedValue(new NotFoundException());

      await expect(controller.cancelAuction(999, mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadAuctionImages', () => {
    it('should upload images and return UploadedFileDto array', async () => {
      const mockFiles = createMockFilesFixture(1);
      const files: { images: Express.Multer.File[] } = {
        images: mockFiles,
      };

      const uploadDto: UploadAuctionImagesDto = { images: [] };

      const uploadedFiles: IUploadedFile[] = [
        {
          filename: mockFiles[0].filename,
          path: mockFiles[0].path,
          url: `/uploads/${mockFiles[0].filename}`,
          size: mockFiles[0].size,
          mimetype: mockFiles[0].mimetype,
        },
      ];

      const options: IUploadOptions = { maxSizeMB: 5, allowedTypes: ['image/jpeg'], subDir: 'auctions' };

      fileUploadService.getAuctionImageUploadOptions.mockReturnValue(options);
      fileUploadService.uploadMultiple.mockResolvedValue(uploadedFiles);

      const result = await controller.uploadAuctionImages(files, uploadDto, mockI18n);

      expect(fileUploadService.uploadMultiple).toHaveBeenCalledWith(files.images, options, mockI18n);
      expect(result).toEqual([new UploadedFileDto(uploadedFiles[0])]);
    });

    it('should throw BadRequestException when no files are provided', async () => {
      const mockEmptyFiles = { images: undefined } as unknown as { images: Express.Multer.File[] };

      await expect(controller.uploadAuctionImages(mockEmptyFiles, {} as UploadAuctionImagesDto, mockI18n)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when images array is empty', async () => {
      await expect(controller.uploadAuctionImages({ images: [] }, {} as UploadAuctionImagesDto, mockI18n)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateAuction', () => {
    it('should call service.updateAuction with correct parameters and return the result', async () => {
      const updateDto: UpdateAuctionDto = { title: 'Updated title' };
      const mockResponse = createAuctionResponseFixture({ title: 'Updated title' });

      service.updateAuction.mockResolvedValue(mockResponse);

      const result = await controller.updateAuction(1, updateDto, mockUser);

      expect(service.updateAuction).toHaveBeenCalledWith(1, updateDto, mockUser.id);
      expect(result).toBe(mockResponse);
    });

    it('should propagate NotFoundException when auction does not exist', async () => {
      service.updateAuction.mockRejectedValue(new NotFoundException());

      await expect(controller.updateAuction(999, {}, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should propagate error when update is not allowed (e.g. not owner)', async () => {
      service.updateAuction.mockRejectedValue(new BadRequestException());

      await expect(controller.updateAuction(1, {}, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateAuctionImages', () => {
    it('should call service.updateAuctionImages without new files and return success message', async () => {
      const updateDto: UpdateAuctionImagesDto = {
        existingImageUrls: ['/uploads/existing.jpg'],
        primaryImageIndex: 0,
      };

      service.updateAuctionImages.mockResolvedValue(undefined);

      const result = await controller.updateAuctionImages(1, { images: [] }, updateDto, mockUser, mockI18n);

      expect(service.updateAuctionImages).toHaveBeenCalledWith(1, mockUser.id, [], updateDto.existingImageUrls, updateDto.primaryImageIndex, mockI18n);
      expect(result).toHaveProperty('message');
    });

    it('should call service.updateAuctionImages with new files when provided', async () => {
      const newFiles = createMockFilesFixture(1);
      const updateDto: UpdateAuctionImagesDto = {
        existingImageUrls: [],
        primaryImageIndex: 0,
      };

      service.updateAuctionImages.mockResolvedValue(undefined);

      await controller.updateAuctionImages(1, { images: newFiles }, updateDto, mockUser, mockI18n);

      expect(service.updateAuctionImages).toHaveBeenCalledWith(1, mockUser.id, newFiles, updateDto.existingImageUrls, updateDto.primaryImageIndex, mockI18n);
    });

    it('should propagate NotFoundException when auction does not exist', async () => {
      service.updateAuctionImages.mockRejectedValue(new NotFoundException());

      await expect(controller.updateAuctionImages(999, { images: [] }, {} as UpdateAuctionImagesDto, mockUser, mockI18n)).rejects.toThrow(NotFoundException);
    });
  });
});
