import { Injectable } from '@nestjs/common';
import { IUploadResult, IStorageStrategy } from '../interfaces';
import { promises as fs } from 'fs';
import { dirname, normalize, sep } from 'path';

@Injectable()
export class LocalStorageStrategy implements IStorageStrategy {
  /**
   * Saves a file to the local disk at the given path.
   *
   * Automatically creates any missing parent directories (equivalent to `mkdir -p`).
   * Returns a public URL in the format `/uploads/...`.
   *
   * @param file - Multer file object containing the `buffer` with the file contents.
   * @param path - Absolute destination path on disk, e.g. `/var/app/uploads/images/photo.jpg`.
   * @returns An `IUploadResult` with a `url` (public URL) and `path` (path on disk).
   */
  async upload(file: Express.Multer.File, path: string): Promise<IUploadResult> {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, file.buffer);

    const url = path.replace(/\\/g, '/').replace(/^.*\/uploads/, '/uploads');

    return { url, path };
  }

  /**
   * Deletes a file at the given absolute path from the local disk.
   *
   * Performs two security checks before deletion:
   * - **Path traversal**: if `normalize(absolutePath) !== absolutePath`, the path contains
   *   sequences such as `..` or redundant separators that change the target — the request is
   *   rejected with `Unsafe path rejected`.
   * - **Relative path**: if the path does not start with `/`, it is rejected
   *   with `Non-absolute path rejected`.
   *
   * Validation that the path is within the `uploads` directory is handled upstream
   * in `FileUploadService` before this method is called.
   *
   * @param absolutePath - The absolute path of the file to delete.
   * @throws {Error} When the path contains path traversal sequences (`Unsafe path rejected`).
   * @throws {Error} When the path is not absolute (`Non-absolute path rejected`).
   */
  async delete(absolutePath: string): Promise<void> {
    const normalized = normalize(absolutePath);

    if (normalized !== absolutePath) throw new Error(`Unsafe path rejected: "${absolutePath}"`);

    if (!normalized.startsWith(sep) && !/^[A-Za-z]:[/\\]/.test(normalized)) throw new Error(`Non-absolute path rejected: "${absolutePath}"`);

    await fs.unlink(normalized);
  }
}
