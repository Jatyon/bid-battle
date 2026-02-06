import { Global, Module } from '@nestjs/common';
import { MailerConfigProvider } from '@shared/providers/mailer-config.provider';
import { I18nConfigProvider } from '@shared/providers/i18n-config.provider';

@Global()
@Module({
  providers: [I18nConfigProvider, MailerConfigProvider],
  exports: [I18nConfigProvider, MailerConfigProvider],
})
export class ProvidersModule {}
