import { Global, Module } from '@nestjs/common';
import { I18nConfigProvider } from '@shared/providers/providers/i18n-config.provider';

@Global()
@Module({
  providers: [I18nConfigProvider],
  exports: [I18nConfigProvider],
})
export class ProvidersModule {}
