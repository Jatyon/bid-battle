import { IMailFooter } from '../interfaces';

export type MailContext<T = Record<string, unknown>> = {
  appName: string;
  appUrl: string;
  footer: IMailFooter;
} & T;
