import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { IConfigFile } from '@config/interfaces';
import { IUploadedFile, IUploadOptions, IStorageStrategy } from './interfaces';
import { LocalStorageStrategy } from './strategies/local-storage.strategy';
import * as crypto from 'crypto';
import { extname } from 'path';

@Injectable()
export class FileUploadService {
  private readonly config: IConfigFile;
  private readonly storageStrategy: IStorageStrategy;
  private readonly logger: Logger = new Logger(FileUploadService.name);

  constructor(private readonly configService: AppConfigService) {
    this.config = this.configService.file;

    switch (this.config.storageType) {
      case 'local':
        this.storageStrategy = new LocalStorageStrategy(this.configService);
        break;
      default: {
        const _exhaustiveCheck: never = this.config.storageType;
        throw new Error(`Unsupported storage type: ${String(_exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Uploads a single file to the configured storage backend.
   *
   * Validates the file (size, MIME type, magic bytes) before writing it to storage.
   * The destination path is automatically generated from the current date and `subDir`.
   *
   * @param file - Multer file object to upload.
   * @param options - Upload constraints: `maxSizeMB`, `allowedTypes`, `subDir`.
   * @returns Metadata about the uploaded file (`filename`, `path`, `url`, `size`, `mimetype`).
   * @throws {BadRequestException} When validation fails (missing file, size exceeded, wrong type).
   * @throws {InternalServerErrorException} When the storage backend fails to write the file.
   */
  async uploadSingle(file: Express.Multer.File, options: IUploadOptions): Promise<IUploadedFile> {
    await this.validateFile(file, options);

    const filename: string = this.generateFilename(file.originalname);
    const fileKey: string = this.generateFileKey(options.subDir, filename);

    try {
      const result = await this.storageStrategy.upload(file, fileKey);

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
      throw new InternalServerErrorException('error.validation.file.upload_failed');
    }
  }

  /**
   * Uploads multiple files in parallel using `uploadSingle` for each.
   *
   * @param files - Array of Multer file objects to upload.
   * @param options - Upload constraints applied to every file.
   * @returns Array of upload result metadata, in the same order as the input files.
   * @throws {BadRequestException} When any file fails validation.
   * @throws {InternalServerErrorException} When the storage backend fails for any file.
   */
  async uploadMultiple(files: Express.Multer.File[], options: IUploadOptions): Promise<IUploadedFile[]> {
    return Promise.all(files.map((file) => this.uploadSingle(file, options)));
  }

  /**
   * Deletes a single file from the storage backend.
   * Errors during deletion are logged but not thrown, to prevent interrupting the main workflow.
   *
   * @param fileKey - The internal key/path of the file to delete (e.g. "2026/05/avatars/xyz.jpg").
   */
  async deleteFile(fileKey: string): Promise<void> {
    try {
      await this.storageStrategy.delete(fileKey);
      this.logger.log(`File deleted successfully: ${fileKey}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to delete file: ${message}`, stack);
    }
  }

  /**
   * Deletes multiple files from the storage backend in parallel.
   * Errors are logged internally by `deleteFile`.
   *
   * @param fileKeys - Array of file keys/paths to delete.
   */
  async deleteFiles(fileKeys: string[]): Promise<void> {
    await Promise.all(fileKeys.map((key) => this.deleteFile(key)));
  }

  /**
   * Extracts the internal file key from a full public URL.
   * Useful when deleting a file using the URL stored in the database.
   *
   * @param url - The full public URL (e.g. "http://localhost:3000/uploads/2026/05/avatar.jpg").
   * @returns The relative file key (e.g. "2026/05/avatar.jpg"), or null if parsing fails.
   */
  extractKeyFromUrl(url: string): string | null {
    try {
      const parsedUrl = new URL(url);

      if (this.config.storageType === 'local') return parsedUrl.pathname.replace(/^\/uploads\//, '');

      return parsedUrl.pathname.replace(/^\//, '');
    } catch {
      this.logger.warn(`Failed to parse URL: ${url}`);
      return null;
    }
  }

  /**
   * Validates a file against the specified upload options.
   *
   * @param file - The file to validate.
   * @param options - The upload options to apply.
   * @throws {BadRequestException} When the file fails validation.
   */
  private async validateFile(file: Express.Multer.File, options: IUploadOptions): Promise<void> {
    if (!file) throw new BadRequestException('error.validation.file.no_file_provided');

    const maxSizeBytes: number = options.maxSizeMB * 1024 * 1024;

    if (file.size > maxSizeBytes) throw new BadRequestException({ message: 'error.validation.file.file_too_large_#maxSize', args: { maxSize: options.maxSizeMB } });

    if (!options.allowedTypes.includes(file.mimetype))
      throw new BadRequestException({ message: 'error.validation.file.invalid_file_type_#allowedTypes', args: { allowedTypes: options.allowedTypes.join(', ') } });

    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(file.buffer);

    if (!detected || !options.allowedTypes.includes(detected.mime)) {
      this.logger.warn(`Magic bytes mismatch: declared=${file.mimetype}, detected=${detected?.mime ?? 'unknown'}, filename=${file.originalname}`);
      throw new BadRequestException({ message: 'error.validation.file.invalid_file_type_#allowedTypes', args: { allowedTypes: options.allowedTypes.join(', ') } });
    }
  }

  /**
   * Builds an agnostic file key (path) using forward slashes.
   * Example: "2026/05/auctions/filename.jpg"
   */
  private generateFileKey(subDir: string, filename: string): string {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    return `${year}/${month}/${subDir}/${filename}`;
  }

  private generateFilename(originalName: string): string {
    const ext: string = extname(originalName);
    const random: string = crypto.randomBytes(8).toString('hex');

    return `${random}${ext}`;
  }

  /**
   * Returns the upload options for auction images, as defined in app configuration.
   *
   * @returns `IUploadOptions` with `subDir` set to `auctions`.
   */
  getAuctionImageUploadOptions(): IUploadOptions {
    return {
      maxSizeMB: this.config.auctionImageMaxSizeMB,
      allowedTypes: this.config.allowedImageTypes,
      subDir: 'auctions',
    };
  }

  /**
   * Returns the upload options for user avatars, as defined in app configuration.
   *
   * @returns `IUploadOptions` with `subDir` set to `avatars`.
   */
  getAvatarUploadOptions(): IUploadOptions {
    return {
      maxSizeMB: this.config.avatarMaxSizeMB,
      allowedTypes: this.config.allowedImageTypes,
      subDir: 'avatars',
    };
  }
}
