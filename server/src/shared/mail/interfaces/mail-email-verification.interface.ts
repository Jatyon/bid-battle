import { IMailUserData } from './mail-user-data.interface';

export interface IMailEmailVerification extends IMailUserData {
  verifyUrl: string;
  expiresInMin: number;
}
