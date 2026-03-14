import { IUploadResult } from './upload-result.interface';
import { I18nContext } from 'nestjs-i18n';

export interface IStorageStrategy {
  upload(file: Express.Multer.File, path: string): Promise<IUploadResult>;
  delete(path: string, i18n: I18nContext): Promise<void>;
}
