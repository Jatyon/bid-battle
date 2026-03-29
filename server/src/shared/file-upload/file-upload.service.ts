import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { IConfigFile } from '@config/interfaces';
import { IUploadedFile, IUploadOptions, IStorageStrategy } from './interfaces';
import { LocalStorageStrategy } from './strategies';
import { join, extname, resolve, basename, sep } from 'path';
import { I18nContext } from 'nestjs-i18n';
import * as crypto from 'crypto';

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
   * Uploads a single file to the configured storage backend.
   *
   * Validates the file (size, MIME type, magic bytes) before writing it to storage.
   * The destination path is automatically generated from the current date and `subDir`.
   *
   * @param file - Multer file object to upload.
   * @param options - Upload constraints: `maxSizeMB`, `allowedTypes`, `subDir`.
   * @param i18n - i18n context used for translating error messages.
   * @returns Metadata about the uploaded file (`filename`, `path`, `url`, `size`, `mimetype`).
   * @throws {BadRequestException} When validation fails (missing file, size exceeded, wrong type).
   * @throws {InternalServerErrorException} When the storage backend fails to write the file.
   */
  async uploadSingle(file: Express.Multer.File, options: IUploadOptions, i18n: I18nContext): Promise<IUploadedFile> {
    await this.validateFile(file, options, i18n);

    const uploadPath: string = this.generateUploadPath(options.subDir);
    const filename: string = this.generateFilename(file.originalname);
    const fullPath: string = join(uploadPath, filename);

    try {
      const result = await this.storageStrategy.upload(file, fullPath);

      let cleanUrl = result.url.replace(/\\/g, '/');

      const folderName = basename(this.config.uploadsDir);
      const prefixRegex = new RegExp(`^\\/?${folderName}\\/`);

      cleanUrl = cleanUrl.replace(prefixRegex, '');
      cleanUrl = cleanUrl.replace(/^\.\//, '');

      this.logger.log(`File uploaded successfully: ${cleanUrl}`);

      return {
        filename,
        path: result.path,
        url: cleanUrl,
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
   * Uploads multiple files in parallel using `uploadSingle` for each.
   *
   * @param files - Array of Multer file objects to upload.
   * @param options - Upload constraints applied to every file.
   * @param i18n - i18n context used for translating error messages.
   * @returns Array of upload result metadata, in the same order as the input files.
   * @throws {BadRequestException} When any file fails validation.
   * @throws {InternalServerErrorException} When the storage backend fails for any file.
   */
  async uploadMultiple(files: Express.Multer.File[], options: IUploadOptions, i18n: I18nContext): Promise<IUploadedFile[]> {
    return Promise.all(files.map((file) => this.uploadSingle(file, options, i18n)));
  }

  /**
   * Deletes a file by its relative path within the uploads directory.
   *
   * Guards against path traversal attacks by resolving the full path and verifying
   * it remains within `uploadsDir`. Paths that escape the uploads root are silently
   * blocked and logged as errors. Deletion failures are also caught and logged
   * without re-throwing, so callers are not interrupted by missing files.
   *
   * @param relativePath - Path relative to the uploads root, e.g. `2026/03/avatars/photo.jpg`.
   */
  async deleteFile(relativePath: string): Promise<void> {
    try {
      const uploadsBaseDir = resolve(this.config.uploadsDir);
      const resolvedPath = resolve(uploadsBaseDir, relativePath);

      if (!resolvedPath.startsWith(uploadsBaseDir + sep)) {
        this.logger.error(`SECURITY ALERT: Path traversal attempt blocked! "${relativePath}" resolved to "${resolvedPath}"`);
        return;
      }

      await this.storageStrategy.delete(resolvedPath);
      this.logger.log(`File deleted successfully: ${relativePath}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to delete file: ${message}`, stack);
    }
  }

  /**
   * Deletes multiple files in parallel using `deleteFile` for each.
   *
   * @param relativePaths - Array of relative paths to delete.
   */
  async deleteFiles(relativePaths: string[]): Promise<void> {
    await Promise.all(relativePaths.map((path) => this.deleteFile(path)));
  }

  /**
   * Validates a file against the provided upload options.
   *
   * Performs a three-step check:
   * 1. **Presence** — rejects missing files.
   * 2. **Size** — rejects files exceeding `options.maxSizeMB`.
   * 3. **MIME type** — checks both the declared `Content-Type` header and the actual
   *    magic bytes from the file buffer. This two-step verification prevents spoofing
   *    by clients that forge the `Content-Type` header in multipart requests.
   *
   * @param file - Multer file object to validate.
   * @param options - Constraints to validate against.
   * @param i18n - i18n context for translating error messages.
   * @throws {BadRequestException} When any of the three checks fails.
   */
  private async validateFile(file: Express.Multer.File, options: IUploadOptions, i18n: I18nContext): Promise<void> {
    if (!file) throw new BadRequestException(i18n.t('error.validation.file.no_file_provided'));

    const maxSizeBytes: number = options.maxSizeMB * 1024 * 1024;

    if (file.size > maxSizeBytes) throw new BadRequestException(i18n.t('error.validation.file.file_too_large_#maxSize', { args: { maxSize: options.maxSizeMB } }));

    if (!options.allowedTypes.includes(file.mimetype))
      throw new BadRequestException(i18n.t('error.validation.file.invalid_file_type_#allowedTypes', { args: { allowedTypes: options.allowedTypes.join(', ') } }));

    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(file.buffer);

    if (!detected || !options.allowedTypes.includes(detected.mime)) {
      this.logger.warn(`Magic bytes mismatch: declared=${file.mimetype}, detected=${detected?.mime ?? 'unknown'}, filename=${file.originalname}`);
      throw new BadRequestException(i18n.t('error.validation.file.invalid_file_type_#allowedTypes', { args: { allowedTypes: options.allowedTypes.join(', ') } }));
    }
  }

  /**
   * Builds the absolute destination directory path for an uploaded file.
   *
   * The path is composed of `uploadsDir / year / month / subDir`,
   * where year and month are derived from the current date.
   *
   * @param subDir - Subdirectory name that groups uploads by context, e.g. `auctions`.
   * @returns Absolute path to the target upload directory.
   */
  private generateUploadPath(subDir: string): string {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const pathParts = [this.config.uploadsDir, year, month];

    pathParts.push(subDir);

    return join(...pathParts);
  }

  /**
   * Generates a random filename while preserving the original file extension.
   *
   * Uses 8 random bytes (16 hex characters) to avoid collisions and prevent
   * user-controlled filenames from reaching the filesystem.
   *
   * @param originalName - Original filename from the upload, used only to extract the extension.
   * @returns A randomised filename, e.g. `a3f8c21d9b0e4f12.jpg`.
   */
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
