import { Global, Module } from '@nestjs/common';
import { MailerConfigProvider } from './mailer-config.provider';
import { I18nConfigProvider } from './i18n-config.provider';

@Global()
@Module({
  providers: [I18nConfigProvider, MailerConfigProvider],
  exports: [I18nConfigProvider, MailerConfigProvider],
})
export class ProvidersModule {}
