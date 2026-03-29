import { BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '@config/config.service';
import { IConfigFile } from '@config/interfaces';
import { IStorageStrategy, IUploadOptions } from './interfaces';
import { FileUploadService } from './file-upload.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { I18nContext } from 'nestjs-i18n';
import { Readable } from 'stream';

jest.mock('path', () => {
  const actual = jest.requireActual<typeof import('path')>('path');
  return {
    ...actual,
    resolve: actual.posix.resolve,
    normalize: actual.posix.normalize,
    join: actual.posix.join,
    sep: '/',
  };
});

const mockFileConfig: IConfigFile = {
  storageType: 'local',
  uploadsDir: '/uploads',
  auctionImageMaxSizeMB: 5,
  avatarMaxSizeMB: 2,
  allowedImageTypes: ['image/jpeg', 'image/png'],
};

const createFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'photo.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  size: 1024 * 1024,
  buffer: Buffer.from('fake-content'),
  destination: '',
  filename: '',
  path: '',
  stream: null as unknown as Readable,
  ...overrides,
});

/** Domyślne opcje uploadu */
const uploadOptions: IUploadOptions = {
  maxSizeMB: 5,
  allowedTypes: ['image/jpeg', 'image/png'],
  subDir: 'auctions',
};

describe('FileUploadService', () => {
  let service: FileUploadService;
  let mockStrategy: DeepMocked<IStorageStrategy>;
  let mockI18n: DeepMocked<I18nContext>;

  beforeEach(async () => {
    mockStrategy = createMock<IStorageStrategy>();
    mockI18n = createMock<I18nContext>({
      t: jest.fn().mockImplementation((key: string) => key),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileUploadService,
        {
          provide: AppConfigService,
          useValue: createMock<AppConfigService>({ file: mockFileConfig }),
        },
      ],
    }).compile();

    service = module.get<FileUploadService>(FileUploadService);

    Object.defineProperty(service, 'storageStrategy', { value: mockStrategy });

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    jest.spyOn(service as any, 'validateFile').mockResolvedValue(undefined);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw when constructed with unsupported storageType', () => {
    const invalidConfig: IConfigFile = { ...mockFileConfig, storageType: 's3' as never };

    expect(() => new FileUploadService(createMock<AppConfigService>({ file: invalidConfig }))).toThrow('Unsupported storage type: s3');
  });

  describe('uploadSingle', () => {
    it('should upload file, strip prefix and return clean URL in IUploadedFile', async () => {
      const file = createFile();
      mockStrategy.upload.mockResolvedValue({ url: '/uploads/2026/03/auctions/abc.jpg', path: '/uploads/2026/03/auctions/abc.jpg' });

      const result = await service.uploadSingle(file, uploadOptions, mockI18n);

      expect(mockStrategy.upload).toHaveBeenCalledWith(file, expect.any(String));
      expect(result).toEqual(
        expect.objectContaining({
          url: '2026/03/auctions/abc.jpg',
          size: file.size,
          mimetype: file.mimetype,
          filename: expect.any(String) as string,
          path: expect.any(String) as string,
        }),
      );
      expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining('File uploaded successfully'));
    });

    it('should include year/month/subDir in the upload path', async () => {
      const file = createFile();
      mockStrategy.upload.mockResolvedValue({ url: '/uploads/result.jpg', path: '/uploads/result.jpg' });

      await service.uploadSingle(file, uploadOptions, mockI18n);

      const callArgs = mockStrategy.upload.mock.calls[0] as [Express.Multer.File, string];
      const uploadPath = callArgs[1];

      expect(uploadPath).toMatch(/\d{4}/);
      expect(uploadPath).toMatch(/\d{2}/);
      expect(uploadPath).toContain('auctions');
    });

    it('should generate a unique filename with original extension', async () => {
      const file = createFile({ originalname: 'my-photo.png' });
      mockStrategy.upload.mockResolvedValue({ url: '/uploads/result.png', path: '/uploads/result.png' });

      await service.uploadSingle(file, uploadOptions, mockI18n);

      const callArgs = mockStrategy.upload.mock.calls[0] as [Express.Multer.File, string];
      const uploadPath = callArgs[1];

      expect(uploadPath).toMatch(/\.png$/);
    });

    it('should throw BadRequestException when file is missing', async () => {
      jest.spyOn(service as any, 'validateFile').mockRestore();

      await expect(service.uploadSingle(null as unknown as Express.Multer.File, uploadOptions, mockI18n)).rejects.toThrow(BadRequestException);

      expect(mockStrategy.upload).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when file exceeds maxSizeMB', async () => {
      jest.spyOn(service as any, 'validateFile').mockRestore();
      const oversizedFile = createFile({ size: 6 * 1024 * 1024 });

      await expect(service.uploadSingle(oversizedFile, uploadOptions, mockI18n)).rejects.toThrow(BadRequestException);

      expect(mockStrategy.upload).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when mimetype is not in allowedTypes', async () => {
      jest.spyOn(service as any, 'validateFile').mockRestore();
      const wrongTypeFile = createFile({ mimetype: 'application/pdf' });

      await expect(service.uploadSingle(wrongTypeFile, uploadOptions, mockI18n)).rejects.toThrow(BadRequestException);

      expect(mockStrategy.upload).not.toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException when storage strategy throws', async () => {
      const file = createFile();
      mockStrategy.upload.mockRejectedValue(new Error('Disk full'));

      await expect(service.uploadSingle(file, uploadOptions, mockI18n)).rejects.toThrow(InternalServerErrorException);

      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('Failed to upload file'), expect.anything());
    });
  });

  describe('uploadMultiple', () => {
    it('should upload all files sequentially and return array of results', async () => {
      const files = [createFile({ originalname: 'a.jpg' }), createFile({ originalname: 'b.png' })];
      mockStrategy.upload.mockResolvedValueOnce({ url: '/uploads/a.jpg', path: '/uploads/a.jpg' }).mockResolvedValueOnce({ url: '/uploads/b.png', path: '/uploads/b.png' });

      const results = await service.uploadMultiple(files, uploadOptions, mockI18n);

      expect(results).toHaveLength(2);
      expect(mockStrategy.upload).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when files array is empty', async () => {
      const results = await service.uploadMultiple([], uploadOptions, mockI18n);

      expect(results).toEqual([]);
      expect(mockStrategy.upload).not.toHaveBeenCalled();
    });

    it('should throw when at least one of the files fails validation', async () => {
      const files = [createFile({ originalname: 'valid.jpg' }), createFile({ mimetype: 'application/pdf' })];
      mockStrategy.upload.mockResolvedValue({ url: '/uploads/valid.jpg', path: '/uploads/valid.jpg' });

      jest.spyOn(service as any, 'validateFile').mockRestore();

      await expect(service.uploadMultiple(files, uploadOptions, mockI18n)).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteFile', () => {
    it('should call strategy.delete with resolved absolute path and log success', async () => {
      mockStrategy.delete.mockResolvedValue(undefined);

      await service.deleteFile('2026/03/auctions/abc.jpg');

      const expectedPath = '/uploads/2026/03/auctions/abc.jpg';

      expect(mockStrategy.delete).toHaveBeenCalledWith(expectedPath);
      expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining('File deleted successfully'));
    });

    it('should log error and not throw when strategy.delete fails', async () => {
      mockStrategy.delete.mockRejectedValue(new Error('File not found'));

      await service.deleteFile('2026/03/auctions/missing.jpg');

      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('Failed to delete file'), expect.anything());
    });

    it('should block path traversal attempts and log a security alert', async () => {
      await service.deleteFile('../../../etc/passwd');

      expect(mockStrategy.delete).not.toHaveBeenCalled();

      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('SECURITY ALERT: Path traversal attempt blocked!'));
    });
  });

  describe('deleteFiles', () => {
    it('should delete all files in parallel via Promise.all', async () => {
      mockStrategy.delete.mockResolvedValue(undefined);

      await service.deleteFiles(['a.jpg', 'b.jpg']);

      expect(mockStrategy.delete).toHaveBeenCalledTimes(2);
      expect(mockStrategy.delete).toHaveBeenCalledWith('/uploads/a.jpg');
      expect(mockStrategy.delete).toHaveBeenCalledWith('/uploads/b.jpg');
    });
  });

  describe('getAuctionImageUploadOptions', () => {
    it('should return options with auctionImageMaxSizeMB and subDir=auctions', () => {
      const options = service.getAuctionImageUploadOptions();

      expect(options).toEqual({
        maxSizeMB: mockFileConfig.auctionImageMaxSizeMB,
        allowedTypes: mockFileConfig.allowedImageTypes,
        subDir: 'auctions',
      });
    });
  });

  describe('getAvatarUploadOptions', () => {
    it('should return options with avatarMaxSizeMB and subDir=avatars', () => {
      const options = service.getAvatarUploadOptions();

      expect(options).toEqual({
        maxSizeMB: mockFileConfig.avatarMaxSizeMB,
        allowedTypes: mockFileConfig.allowedImageTypes,
        subDir: 'avatars',
      });
    });
  });
});
