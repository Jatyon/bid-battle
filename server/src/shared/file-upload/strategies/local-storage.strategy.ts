import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { IUploadResult, IStorageStrategy } from '../interfaces';
import { dirname, normalize, sep, resolve } from 'path';
import { promises as fs } from 'fs';

@Injectable()
export class LocalStorageStrategy implements IStorageStrategy {
  constructor(private readonly configService: AppConfigService) {}

  /**
   * Saves a file to the local disk and returns its public URL.
   * Automatically creates any missing parent directories.
   */
  async upload(file: Express.Multer.File, fileKey: string): Promise<IUploadResult> {
    const uploadsDir = this.configService.file.uploadsDir;
    const absolutePath = resolve(uploadsDir, fileKey);

    await fs.mkdir(dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);

    const publicUrl = this.configService.app.publicUrl.replace(/\/$/, '');
    const url = `${publicUrl}/uploads/${fileKey}`;

    return { url, path: fileKey };
  }

  /**
   * Deletes a file from the local disk.
   * Prevents path traversal vulnerabilities by enforcing strict path resolution.
   */
  async delete(fileKey: string): Promise<void> {
    const uploadsDir = resolve(this.configService.file.uploadsDir);
    const absolutePath = resolve(uploadsDir, fileKey);

    if (!absolutePath.startsWith(uploadsDir + sep)) throw new Error(`SECURITY ALERT: Path traversal attempt blocked! "${fileKey}" resolved outside uploads directory.`);

    const normalized = normalize(absolutePath);

    if (normalized !== absolutePath) throw new Error(`Unsafe path rejected: "${absolutePath}"`);

    await fs.unlink(normalized);
  }
}
