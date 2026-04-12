import { INestApplication, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@app/app.module';
import { AppConfigService } from '@config/config.service';
import { LoggingInterceptor, TimeoutInterceptor, TransformInterceptor } from '@core/interceptors';
import { HttpExceptionFilter } from '@core/filters/http-exception.filter';
import { MailConsumerService, MailService } from '@shared/mail';
import { I18nService } from 'nestjs-i18n';
import { App } from 'supertest/types';
import request from 'supertest';

jest.mock('@css-inline/css-inline', () => ({
  inline: jest.fn((html: string): string => html),
}));

describe('App (e2e)', () => {
  let app: INestApplication<App>;
  let configService: AppConfigService;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
        sendForgotPasswordEmail: jest.fn().mockResolvedValue(undefined),
        sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
        sendAuctionWinnerEmail: jest.fn().mockResolvedValue(undefined),
        sendAuctionOwnerEmail: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(MailConsumerService)
      .useValue({ onModuleInit: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    configService = app.get(AppConfigService);

    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter(app.get(I18nService), configService));
    app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor(), new TimeoutInterceptor(configService.app.timeoutMs));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live', () => {
    return request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
  });
});
