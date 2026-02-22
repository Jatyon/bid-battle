import { createMock } from '@golevelup/ts-jest';
import { I18nContext, I18nService } from 'nestjs-i18n';

export const createMockI18nContext = (overrides: Record<string, string> = {}) =>
  createMock<I18nContext>({
    t: jest.fn().mockImplementation((key: string) => overrides[key] ?? key),
  });

export const createMockI18nService = (overrides: Record<string, string> = {}) =>
  createMock<I18nService>({
    t: jest.fn().mockImplementation((key: string) => overrides[key] ?? key),
  });
