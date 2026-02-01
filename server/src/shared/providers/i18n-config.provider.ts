import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/services/config.service';
import { I18nOptionsFactory, I18nOptionsWithoutResolvers } from 'nestjs-i18n';

@Injectable()
export class I18nConfigProvider implements I18nOptionsFactory {
  constructor(private readonly configService: AppConfigService) {}

  createI18nOptions(): I18nOptionsWithoutResolvers {
    return {
      loaderOptions: {
        path: 'resources/i18n/',
      },
      fallbackLanguage: this.configService.i18n.fallbackLanguage,
    };
  }
}
