import { IMailUserData } from './mail-user-data.interface';

export interface IMailForgotPassword extends IMailUserData {
  forgotUrl: string;
  expiresInMin: number;
}
