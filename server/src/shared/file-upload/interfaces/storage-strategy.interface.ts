import { IUploadResult } from './upload-result.interface';

export interface IStorageStrategy {
  upload(file: Express.Multer.File, path: string): Promise<IUploadResult>;
  delete(path: string): Promise<void>;
}
