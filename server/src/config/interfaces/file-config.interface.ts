import { StorageType } from '@shared/file-upload';

export interface IConfigFile {
  avatarMaxSizeMB: number;
  auctionImageMaxSizeMB: number;
  allowedImageTypes: string[];
  uploadsDir: string;
  storageType: StorageType;
}
