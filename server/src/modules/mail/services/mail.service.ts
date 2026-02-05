import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { AppConfigService } from '@config/services/config.service';
import { IMailOptions } from '@modules/mail/interfaces/mail-options.interface';
import { IMailFooter } from '@modules/mail/interfaces/mail-footer.interface';
import { JobName } from '@modules/mail/enums/mail-job-name.enum';
import { I18nService } from 'nestjs-i18n';
import { Job, Queue } from 'bullmq';

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

    await this.sendCriticalEmail({
      to: email,
      subject,
      template: `./${lang}/test`,
      context: {
        appName: this.appName,
        appUrl: this.appUrl,
        footer: footerTranslations,
      },
    });

    this.logger.log(`Test email to ${email} has been added to queue`);
  }

  getFooterTranslations(lang: string): IMailFooter {
    return {
      rights: this.i18n.t('mail.footer.rights', { lang }),
    };
  }

  async sendCriticalEmail(payload: IMailOptions): Promise<Job<IMailOptions>> {
    return this.mailQueue.add(JobName.CRITICAL_MAIL, payload, {
      priority: 1,
      attempts: 3,
      backoff: 5000,
      removeOnComplete: true,
    });
  }

  async sendBulkEmail(payload: IMailOptions): Promise<Job<IMailOptions>> {
    return this.mailQueue.add(JobName.BULK_MAIL, payload, {
      attempts: 1,
      removeOnComplete: true,
    });
  }
}
