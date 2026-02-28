import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { AppConfigService } from '@config/config.service';
import { IMailFooter, IMailOptions, IMailForgotPassword } from './interfaces';
import { MailContext } from './types';
import { JobName } from './enums';
import { I18nService } from 'nestjs-i18n';
import { Job, Queue } from 'bullmq';
import { IMailUserData } from './interfaces/mail-user-data.interface';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly appName: string;
  private readonly appUrl: string;

  constructor(
    @InjectQueue('mail-queue') private mailQueue: Queue<IMailOptions>,
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

  private getFooterTranslations(lang: string): IMailFooter {
    return {
      rights: this.i18n.t('mail.footer.rights', { lang }),
    };
  }

  private sendCriticalEmail(payload: IMailOptions): Promise<Job<IMailOptions>> {
    return this.mailQueue.add(JobName.CRITICAL_MAIL, payload, {
      priority: 1,
      attempts: 3,
      backoff: 5000,
      removeOnComplete: true,
    });
  }

  private sendBulkEmail(payload: IMailOptions): Promise<Job<IMailOptions>> {
    return this.mailQueue.add(JobName.BULK_MAIL, payload, {
      attempts: 1,
      removeOnComplete: true,
    });
  }
}
