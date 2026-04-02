import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WorkerHost, Processor } from '@nestjs/bullmq';
import { AppConfigService } from '@config/config.service';
import { IMailOptions, IMailOptionsTemplate } from './interfaces';
import { JobName } from './enums';
import hbs from 'nodemailer-express-handlebars';
import { Transporter } from 'nodemailer';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import { Job } from 'bullmq';

@Injectable()
@Processor('mail-queue')
export class MailConsumerService extends WorkerHost implements OnModuleInit {
  private transporter: Transporter;
  private readonly logger = new Logger(MailConsumerService.name);
  private readonly fromEmail: string;
  private readonly appName: string;

  constructor(private configService: AppConfigService) {
    super();
    this.fromEmail = this.configService.mailer.from.address;
    this.appName = this.configService.app.name;
  }

  onModuleInit() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const smtpHost = this.configService.mailer.host;
    const smtpPort = this.configService.mailer.port;
    const smtpUser = this.configService.mailer.auth.user;
    const smtpPass = this.configService.mailer.auth.pass;
    const smtpSecure = this.configService.mailer.secure;

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    this.transporter.verify((error) => {
      if (error) this.logger.error('SMTP connection error:', error);
      else this.logger.log('SMTP server is ready to send emails');
    });

    const handlebarOptions = {
      viewEngine: {
        extname: '.hbs',
        partialsDir: path.join('resources/emails', './partials'),
        layoutsDir: path.join('resources/emails', './layouts'),
        defaultLayout: 'base',
      },
      viewPath: path.join('resources/emails'),
      extName: '.hbs',
    };

    this.transporter.use('compile', hbs(handlebarOptions));
    this.logger.log('Handlebars templates configured');
  }

  async process(job: Job<IMailOptions>): Promise<any> {
    switch (job.name as JobName) {
      case JobName.CRITICAL_MAIL:
        await this.handleCriticalMail(job.data);
        break;

      case JobName.BULK_MAIL:
        await this.handleBulkMail(job.data);
        break;

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  /**
   * Called by BullMQ WorkerHost after every failed attempt — including the final one.
   * When all retry attempts are exhausted (`job.attemptsMade >= job.opts.attempts`),
   * the job is permanently dead. We emit an ERROR-level log here so that any log
   * aggregator (Winston → file/cloud) or alerting pipeline can pick it up.
   *
   * The job itself is kept in the `failed` set (removeOnFail: false on critical mails)
   * so it can be inspected and manually retried via the BullMQ dashboard or CLI.
   */
  onWorkerFailed(job: Job<IMailOptions> | undefined, error: Error): void {
    if (!job) {
      this.logger.error(`[DLQ] Mail job failed with no job context — error: ${error.message}`, error.stack);
      return;
    }

    const maxAttempts = job.opts?.attempts ?? 1;
    const isPermanentFailure = job.attemptsMade >= maxAttempts;

    if (isPermanentFailure) {
      this.logger.error(
        `[DLQ] Mail job permanently failed after ${job.attemptsMade} attempt(s) — ` +
          `job.id=${job.id}, name=${job.name}, to=${job.data?.to ?? 'unknown'}, ` +
          `subject="${job.data?.subject ?? 'unknown'}" — manual retry required`,
        error.stack,
      );
      return;
    }

    this.logger.warn(
      `[RETRY] Mail job failed (attempt ${job.attemptsMade}/${maxAttempts}) — ` + `job.id=${job.id}, name=${job.name}, to=${job.data?.to ?? 'unknown'}: ${error.message}`,
    );
  }

  private async handleCriticalMail(options: IMailOptions) {
    await this.sendEmail(options);
  }

  private async handleBulkMail(options: IMailOptions) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await this.sendEmail(options);
  }

  private async sendEmail(options: IMailOptions): Promise<void> {
    try {
      const context = {
        ...options.context,
        appName: this.appName,
        year: new Date().getFullYear(),
      };

      const mailOptions: IMailOptionsTemplate = {
        from: `"${this.appName}" <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        template: options.template,
        context: context,
      };

      await this.transporter.sendMail(mailOptions);

      this.logger.log(`Email sent to ${options.to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${error}`);
      throw error;
    }
  }
}
