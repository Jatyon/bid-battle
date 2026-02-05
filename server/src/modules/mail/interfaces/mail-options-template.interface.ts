import * as nodemailer from 'nodemailer';

export interface IMailOptionsTemplate extends nodemailer.SendMailOptions {
  template?: string;
  context?: Record<string, any>;
}
