import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { MailerOptions, MailerOptionsFactory } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import * as path from 'path';

@Injectable()
export class MailerConfigProvider implements MailerOptionsFactory {
  constructor(private readonly configService: AppConfigService) {}

  createMailerOptions(): MailerOptions {
    return {
      defaults: {
        from: this.configService.mailer.from,
      },
      transport: {
        host: this.configService.mailer.host,
        port: this.configService.mailer.port,
        ignoreTLS: this.configService.mailer.ignoreTLS,
        secure: this.configService.mailer.secure,
        auth: this.configService.mailer.auth,
      },
      template: {
        dir: path.normalize(path.join(process.env.APP_ROOT ?? process.cwd(), 'resources/emails/')),
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
    };
  }
}
