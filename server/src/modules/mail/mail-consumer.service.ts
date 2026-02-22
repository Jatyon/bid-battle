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
  private readonly supportEmail: string;

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

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false,
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
        supportEmail: this.supportEmail,
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
