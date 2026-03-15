import { Injectable } from '@nestjs/common';
import { IUploadResult, IStorageStrategy } from '../interfaces';
import { promises as fs } from 'fs';
import { dirname } from 'path';

@Injectable()
export class LocalStorageStrategy implements IStorageStrategy {
  async upload(file: Express.Multer.File, path: string): Promise<IUploadResult> {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, file.buffer);

    const url = path.replace(/\\/g, '/').replace(/^.*\/uploads/, '/uploads');

    return { url, path };
  }

  async delete(path: string): Promise<void> {
    await fs.unlink(path);
  }
}
