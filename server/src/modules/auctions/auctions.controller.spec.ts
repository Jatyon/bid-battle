import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Paginator, PaginatorResponse } from '@core/models';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { createMockI18nContext } from '@test/mocks/i18n.mock';
import { FileUploadService, IUploadOptions, IUploadedFile } from '@shared/file-upload';
import { AuctionResponse, AuctionDetailResponse, CreateAuctionDto, UploadAuctionImagesDto, UpdateAuctionDto, UpdateAuctionImagesDto, UploadedFileDto } from './dto';
import { AuctionsController } from './auctions.controller';
import { AuctionsService } from './auctions.service';
import { AuctionStatus } from './enums';
import { Auction } from './entities';

describe('AuctionsController', () => {
  let controller: AuctionsController;
  let service: AuctionsService;
  let fileUploadService: FileUploadService;

  const mockUser = createUserFixture();
  const mockI18n = createMockI18nContext();

  const baseAuctionData = {
    id: 1,
    title: 'Test Auction',
    description: 'Test Description',
    mainImageUrl: '/uploads/main.jpg',
    startingPrice: 100,
    currentPrice: 100,
    status: AuctionStatus.ACTIVE,
    ownerId: 1,
    endTime: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseOwner = {
    id: 1,
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    avatar: null,
  };

  const buildCreateAuctionDto = (overrides: Partial<CreateAuctionDto> = {}): CreateAuctionDto =>
    ({
      title: baseAuctionData.title,
      description: baseAuctionData.description,
      startingPrice: baseAuctionData.startingPrice,
      imageUrls: [baseAuctionData.mainImageUrl],
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    }) as CreateAuctionDto;

  const buildAuctionResponse = (overrides: Partial<Auction> = {}) => new AuctionResponse({ ...baseAuctionData, ...overrides } as Auction);

  const buildAuctionDetailResponse = (overrides: Partial<Auction> = {}) =>
    new AuctionDetailResponse({
      ...baseAuctionData,
      images: [{ imageUrl: baseAuctionData.mainImageUrl }],
      owner: baseOwner,
      ...overrides,
    } as Auction);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuctionsController],
      providers: [
        {
          provide: AuctionsService,
          useValue: {
            createAuction: jest.fn(),
            findActiveAuctions: jest.fn(),
            findOne: jest.fn(),
            cancelAuction: jest.fn(),
            updateAuction: jest.fn(),
            updateAuctionImages: jest.fn(),
          },
        },
        {
          provide: FileUploadService,
          useValue: {
            uploadMultiple: jest.fn(),
            getAuctionImageUploadOptions: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuctionsController>(AuctionsController);
    service = module.get<AuctionsService>(AuctionsService);
    fileUploadService = module.get<FileUploadService>(FileUploadService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createAuction', () => {
    it('should call service.createAuction with correct parameters and return the result', async () => {
      const createAuctionDto = buildCreateAuctionDto();
      const mockResponse = buildAuctionResponse();

      jest.spyOn(service, 'createAuction').mockResolvedValue(mockResponse);

      const result = await controller.createAuction(createAuctionDto, mockUser);

      expect(service.createAuction).toHaveBeenCalledWith(createAuctionDto, mockUser.id);
      expect(result).toBe(mockResponse);
    });

    it('should propagate error thrown by service', async () => {
      const createAuctionDto = buildCreateAuctionDto();

      jest.spyOn(service, 'createAuction').mockRejectedValue(new BadRequestException());

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

      jest.spyOn(service, 'findActiveAuctions').mockResolvedValue(mockResponse);

      const paginator = Object.assign(new Paginator(), { page: 1, limit: 10 });

      const result = await controller.getAuctions(paginator);

      expect(service.findActiveAuctions).toHaveBeenCalledWith(paginator);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getAuction', () => {
    it('should return auction detail by id', async () => {
      const mockResponse = buildAuctionDetailResponse();

      jest.spyOn(service, 'findOne').mockResolvedValue(mockResponse);

      const result = await controller.getAuction(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toBe(mockResponse);
    });

    it('should propagate NotFoundException when auction does not exist', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(controller.getAuction(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelAuction', () => {
    it('should cancel auction and return response with CANCELED status', async () => {
      const mockResponse = buildAuctionResponse({ status: AuctionStatus.CANCELED });

      jest.spyOn(service, 'cancelAuction').mockResolvedValue(mockResponse);

      const result = await controller.cancelAuction(1, mockUser);

      expect(service.cancelAuction).toHaveBeenCalledWith(1, mockUser.id);
      expect(result.status).toBe(AuctionStatus.CANCELED);
    });

    it('should propagate error when cancellation is not allowed', async () => {
      jest.spyOn(service, 'cancelAuction').mockRejectedValue(new BadRequestException());

      await expect(controller.cancelAuction(1, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should propagate NotFoundException when auction does not exist', async () => {
      jest.spyOn(service, 'cancelAuction').mockRejectedValue(new NotFoundException());

      await expect(controller.cancelAuction(999, mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadAuctionImages', () => {
    it('should upload images and return UploadedFileDto array', async () => {
      const files: { images: Express.Multer.File[] } = {
        images: [{ originalname: 'test.jpg' } as unknown as Express.Multer.File],
      };
      const uploadDto: UploadAuctionImagesDto = { images: [] };
      const uploadedFiles: IUploadedFile[] = [
        {
          filename: 'test.jpg',
          path: '/uploads/test.jpg',
          url: '/uploads/test.jpg',
          size: 123,
          mimetype: 'image/jpeg',
        },
      ];
      const options: IUploadOptions = { maxSizeMB: 5, allowedTypes: ['image/jpeg'], subDir: 'auctions' };

      jest.spyOn(fileUploadService, 'getAuctionImageUploadOptions').mockReturnValue(options);
      jest.spyOn(fileUploadService, 'uploadMultiple').mockResolvedValue(uploadedFiles);

      const result = await controller.uploadAuctionImages(files, uploadDto, mockI18n);

      expect(fileUploadService.uploadMultiple).toHaveBeenCalledWith(files.images, options, mockI18n);
      expect(result).toEqual([new UploadedFileDto(uploadedFiles[0])]);
    });

    it('should throw BadRequestException when no files are provided', async () => {
      await expect(controller.uploadAuctionImages({ images: undefined }, {} as UploadAuctionImagesDto, mockI18n)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when images array is empty', async () => {
      await expect(controller.uploadAuctionImages({ images: [] }, {} as UploadAuctionImagesDto, mockI18n)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateAuction', () => {
    it('should call service.updateAuction with correct parameters and return the result', async () => {
      const updateDto: UpdateAuctionDto = { title: 'Updated title' };
      const mockResponse = buildAuctionResponse({ title: 'Updated title' });

      jest.spyOn(service, 'updateAuction').mockResolvedValue(mockResponse);

      const result = await controller.updateAuction(1, updateDto, mockUser);

      expect(service.updateAuction).toHaveBeenCalledWith(1, updateDto, mockUser.id);
      expect(result).toBe(mockResponse);
    });

    it('should propagate NotFoundException when auction does not exist', async () => {
      jest.spyOn(service, 'updateAuction').mockRejectedValue(new NotFoundException());

      await expect(controller.updateAuction(999, {}, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should propagate error when update is not allowed (e.g. not owner)', async () => {
      jest.spyOn(service, 'updateAuction').mockRejectedValue(new BadRequestException());

      await expect(controller.updateAuction(1, {}, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateAuctionImages', () => {
    it('should call service.updateAuctionImages without new files and return success message', async () => {
      const updateDto: UpdateAuctionImagesDto = {
        existingImageUrls: ['/uploads/existing.jpg'],
        primaryImageIndex: 0,
      };

      jest.spyOn(service, 'updateAuctionImages').mockResolvedValue(undefined);

      const result = await controller.updateAuctionImages(1, { images: [] }, updateDto, mockUser, mockI18n);

      expect(service.updateAuctionImages).toHaveBeenCalledWith(1, mockUser.id, [], updateDto.existingImageUrls, updateDto.primaryImageIndex, mockI18n);
      expect(result).toHaveProperty('message');
    });

    it('should call service.updateAuctionImages with new files when provided', async () => {
      const newFiles: Express.Multer.File[] = [{ originalname: 'new.jpg' } as unknown as Express.Multer.File];
      const updateDto: UpdateAuctionImagesDto = {
        existingImageUrls: [],
        primaryImageIndex: 0,
      };

      jest.spyOn(service, 'updateAuctionImages').mockResolvedValue(undefined);

      await controller.updateAuctionImages(1, { images: newFiles }, updateDto, mockUser, mockI18n);

      expect(service.updateAuctionImages).toHaveBeenCalledWith(1, mockUser.id, newFiles, updateDto.existingImageUrls, updateDto.primaryImageIndex, mockI18n);
    });

    it('should propagate NotFoundException when auction does not exist', async () => {
      jest.spyOn(service, 'updateAuctionImages').mockRejectedValue(new NotFoundException());

      await expect(controller.updateAuctionImages(999, { images: [] }, {} as UpdateAuctionImagesDto, mockUser, mockI18n)).rejects.toThrow(NotFoundException);
    });
  });
});
