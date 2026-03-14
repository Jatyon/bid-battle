import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { IConfigFile } from '@config/interfaces';
import { IUploadedFile, IUploadOptions, IStorageStrategy } from './interfaces';
import { LocalStorageStrategy } from './strategies';
import { I18nContext } from 'nestjs-i18n';
import { join, extname } from 'path';

@Injectable()
export class FileUploadService {
  private readonly config: IConfigFile;
  private readonly storageStrategy: IStorageStrategy;
  private readonly logger: Logger = new Logger(FileUploadService.name);

  constructor(private readonly configService: AppConfigService) {
    this.config = this.configService.file;

    switch (this.config.storageType) {
      case 'local':
        this.storageStrategy = new LocalStorageStrategy();
        break;
      default: {
        const _exhaustiveCheck: never = this.config.storageType;
        throw new Error(`Unsupported storage type: ${String(_exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Upload a single file
   */
  async uploadSingle(file: Express.Multer.File, options: IUploadOptions, i18n: I18nContext): Promise<IUploadedFile> {
    this.validateFile(file, options, i18n);

    const uploadPath: string = this.generateUploadPath(options.subDir);
    const filename: string = this.generateFilename(file.originalname);
    const fullPath: string = join(uploadPath, filename);

    try {
      const result = await this.storageStrategy.upload(file, fullPath);
      this.logger.log(`File uploaded successfully: ${result.url}`);

      return {
        filename,
        path: result.path,
        url: result.url,
        size: file.size,
        mimetype: file.mimetype,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Failed to upload file: ${message}`, stack);
      throw new InternalServerErrorException(i18n.t('error.validation.file.upload_failed'));
    }
  }

  /**
   * Upload multiple files
   */
  async uploadMultiple(files: Express.Multer.File[], options: IUploadOptions, i18n: I18nContext): Promise<IUploadedFile[]> {
    const results: IUploadedFile[] = [];

    for (const file of files) {
      const uploaded = await this.uploadSingle(file, options, i18n);
      results.push(uploaded);
    }

    return results;
  }

  /**
   * Delete a file by its relative path (from uploads dir)
   */
  async deleteFile(relativePath: string, i18n: I18nContext): Promise<void> {
    const fullPath = join(this.config.uploadsDir, relativePath);
    await this.storageStrategy.delete(fullPath, i18n);
    this.logger.log(`File deleted successfully: ${relativePath}`);
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(relativePaths: string[], i18n: I18nContext): Promise<void> {
    await Promise.all(relativePaths.map((path) => this.deleteFile(path, i18n)));
  }

  private validateFile(file: Express.Multer.File, options: IUploadOptions, i18n: I18nContext): void {
    if (!file) throw new BadRequestException(i18n.t('error.validation.file.no_file_provided'));

    const maxSizeBytes: number = options.maxSizeMB * 1024 * 1024;

    if (file.size > maxSizeBytes) throw new BadRequestException(i18n.t('error.validation.file.file_too_large_#maxSize', { args: { maxSize: options.maxSizeMB } }));

    if (!options.allowedTypes.includes(file.mimetype))
      throw new BadRequestException(i18n.t('error.validation.file.invalid_file_type_#allowedTypes', { args: { allowedTypes: options.allowedTypes.join(', ') } }));
  }

  private generateUploadPath(subDir: string): string {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const pathParts = [this.config.uploadsDir, year, month];

    pathParts.push(subDir);

    return join(...pathParts);
  }

  private generateFilename(originalName: string): string {
    const ext: string = extname(originalName);
    const timestamp: number = Date.now();
    const random: string = Math.random().toString(36).substring(2, 8);

    return `${timestamp}-${random}${ext}`;
  }

  getAuctionImageUploadOptions(): IUploadOptions {
    return {
      maxSizeMB: this.config.auctionImageMaxSizeMB,
      allowedTypes: this.config.allowedImageTypes,
      subDir: 'auctions',
    };
  }

  getAvatarUploadOptions(): IUploadOptions {
    return {
      maxSizeMB: this.config.avatarMaxSizeMB,
      allowedTypes: this.config.allowedImageTypes,
      subDir: 'avatars',
    };
  }
}
