import { IMailFooter } from './mail-footer.interface';

export interface IMailContext {
  appName: string;
  appUrl: string;
  footer: IMailFooter;
}
