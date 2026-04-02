import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { AppConfigService } from '@config/config.service';
import { IMailFooter, IMailOptions, IMailForgotPassword, IMailUserData, IMailAuctionWinner, IMailAuctionOwner, IMailEmailVerification } from './interfaces';
import { MAIL_QUEUE } from './mail.constants';
import { MailContext } from './types';
import { JobName } from './enums';
import { I18nService } from 'nestjs-i18n';
import { Job, Queue } from 'bullmq';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly appName: string;
  private readonly appUrl: string;

  constructor(
    @InjectQueue(MAIL_QUEUE) private mailQueue: Queue<IMailOptions>,
    private configService: AppConfigService,
    private readonly i18n: I18nService,
  ) {
    this.appName = this.configService.app.name;
    this.appUrl = this.configService.app.frontendHost;
  }

  async sendTestEmail(email: string, lang: string): Promise<void> {
    const subject = this.i18n.t('mail.subjects.test', { lang });
    const footerTranslations = this.getFooterTranslations(lang);

    const context: MailContext = {
      appName: this.appName,
      appUrl: this.appUrl,
      footer: footerTranslations,
    };

    await this.sendCriticalEmail({
      to: email,
      subject,
      template: `./${lang}/test`,
      context,
    });

    this.logger.log(`Test email to ${email} has been added to queue`);
  }

  async sendForgotPasswordEmail(email: string, lang: string, userName: string, expiresInMin: number, token: string): Promise<void> {
    const subject = this.i18n.t('mail.subjects.forgot-password', { lang });
    const footerTranslations = this.getFooterTranslations(lang);

    const forgotUrl = `${this.appUrl}/auth/forgot-password?token=${token}`;

    const context: MailContext<IMailForgotPassword> = {
      appName: this.appName,
      appUrl: this.appUrl,
      footer: footerTranslations,
      userName,
      forgotUrl,
      expiresInMin,
    };

    await this.sendCriticalEmail({
      to: email,
      subject,
      template: `./${lang}/forgot-password`,
      context,
    });
  }

  async sendPasswordChangedEmail(email: string, lang: string, userName: string): Promise<void> {
    const subject = this.i18n.t('mail.subjects.reset-password', { lang });
    const footerTranslations = this.getFooterTranslations(lang);

    const context: MailContext<IMailUserData> = {
      appName: this.appName,
      appUrl: this.appUrl,
      footer: footerTranslations,
      userName,
    };

    await this.sendCriticalEmail({
      to: email,
      subject,
      template: `./${lang}/reset-password`,
      context,
    });
  }

  async sendAuctionWinnerEmail(email: string, lang: string, userName: string, auctionTitle: string, finalPrice: number, auctionId: number): Promise<void> {
    const subject = this.i18n.t('mail.subjects.auction-winner', { lang });
    const footerTranslations = this.getFooterTranslations(lang);

    const context: MailContext<IMailAuctionWinner> = {
      appName: this.appName,
      appUrl: this.appUrl,
      footer: footerTranslations,
      userName,
      auctionTitle,
      finalPrice,
      auctionUrl: `${this.appUrl}/auctions/${auctionId}`,
    };

    await this.sendCriticalEmail({
      to: email,
      subject,
      template: `./${lang}/auction-winner`,
      context,
    });
  }

  async sendAuctionOwnerEmail(email: string, lang: string, userName: string, auctionTitle: string, finalPrice: number, auctionId: number, winnerName?: string): Promise<void> {
    const subject = this.i18n.t('mail.subjects.auction-owner', { lang });
    const footerTranslations = this.getFooterTranslations(lang);

    const context: MailContext<IMailAuctionOwner> = {
      appName: this.appName,
      appUrl: this.appUrl,
      footer: footerTranslations,
      userName,
      auctionTitle,
      finalPrice,
      auctionUrl: `${this.appUrl}/auctions/${auctionId}`,
      hasWinner: !!winnerName,
      winnerName,
    };

    await this.sendCriticalEmail({
      to: email,
      subject,
      template: `./${lang}/auction-owner`,
      context,
    });
  }

  async sendEmailVerificationEmail(email: string, lang: string, userName: string, expiresInMin: number, token: string): Promise<void> {
    const subject = this.i18n.t('mail.subjects.verify-email', { lang });
    const footerTranslations = this.getFooterTranslations(lang);

    const verifyUrl = `${this.appUrl}/auth/verify-email?token=${token}`;

    const context: MailContext<IMailEmailVerification> = {
      appName: this.appName,
      appUrl: this.appUrl,
      footer: footerTranslations,
      userName,
      verifyUrl,
      expiresInMin,
    };

    await this.sendCriticalEmail({
      to: email,
      subject,
      template: `./${lang}/verify-email`,
      context,
    });
  }

  private getFooterTranslations(lang: string): IMailFooter {
    return {
      rights: this.i18n.t('mail.footer.rights', { lang }),
    };
  }

  private sendCriticalEmail(payload: IMailOptions): Promise<Job<IMailOptions>> {
    return this.mailQueue.add(JobName.CRITICAL_MAIL, payload, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  private sendBulkEmail(payload: IMailOptions): Promise<Job<IMailOptions>> {
    return this.mailQueue.add(JobName.BULK_MAIL, payload, {
      attempts: 1,
      removeOnComplete: true,
    });
  }
}
