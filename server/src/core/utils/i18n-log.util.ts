import { AppConfigService } from '@config/config.service';
import { I18nService } from 'nestjs-i18n';

/** Resolves a message for server logs — always uses the configured fallback language (English). */
export function translateForLog(i18n: I18nService, config: AppConfigService, key: string, args?: Record<string, unknown>): string {
  const lang = config.i18n.fallbackLanguage;

  try {
    return i18n.t(key, { lang, args });
  } catch {
    return key;
  }
}
