/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { INestApplication, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@app/app.module';
import { AppConfigService } from '@config/config.service';
import { LoggingInterceptor, TimeoutInterceptor, TransformInterceptor } from '@core/interceptors';
import { HttpExceptionFilter } from '@core/filters/http-exception.filter';
import { HealthService } from '@health/health.service';
import { MailConsumerService, MailService } from '@shared/mail';
import { I18nService } from 'nestjs-i18n';
import { App } from 'supertest/types';
import request from 'supertest';

jest.mock('@css-inline/css-inline', () => ({
  inline: jest.fn((html: string): string => html),
}));

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  let configService: AppConfigService;
  let healthService: HealthService;

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
      .useValue({
        onModuleInit: jest.fn(),
        process: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    configService = app.get(AppConfigService);
    healthService = app.get(HealthService);

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

  // ──────────────────────────────────────────────
  // GET /api/v1/health/live
  // ──────────────────────────────────────────────
  describe('GET /api/v1/health/live', () => {
    it('should return 200 with status UP', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status', 'UP');
    });

    it('should be accessible without authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    });

    it('should respond quickly (under 500ms)', async () => {
      const start = Date.now();
      await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
    });

    it('should not expose sensitive data in response', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);

      expect(response.body.data).not.toHaveProperty('database');
      expect(response.body.data).not.toHaveProperty('redis');
      expect(response.body.data).not.toHaveProperty('bullmq');
    });
  });

  // ──────────────────────────────────────────────
  // GET /api/v1/health/ready
  // ──────────────────────────────────────────────
  describe('GET /api/v1/health/ready', () => {
    it('should return 200 with status UP when all dependencies are healthy', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status', 'UP');
    });

    it('should be accessible without authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    });

    it('should include database component with status and responseTimeMs', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

      expect(response.body.data).toHaveProperty('database');
      expect(response.body.data.database).toHaveProperty('status', 'UP');
      expect(response.body.data.database).toHaveProperty('responseTimeMs');
      expect(typeof response.body.data.database.responseTimeMs).toBe('number');
    });

    it('should include redis component with status and responseTimeMs', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

      expect(response.body.data).toHaveProperty('redis');
      expect(response.body.data.redis).toHaveProperty('status', 'UP');
      expect(response.body.data.redis).toHaveProperty('responseTimeMs');
      expect(typeof response.body.data.redis.responseTimeMs).toBe('number');
    });

    it('should include bullmq component with status and responseTimeMs', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

      expect(response.body.data).toHaveProperty('bullmq');
      expect(response.body.data.bullmq).toHaveProperty('status', 'UP');
      expect(response.body.data.bullmq).toHaveProperty('responseTimeMs');
      expect(typeof response.body.data.bullmq.responseTimeMs).toBe('number');
    });

    it('should return status UP only when all components are UP', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

      const { data } = response.body;
      const allUp = data.database.status === 'UP' && data.redis.status === 'UP' && data.bullmq.status === 'UP';

      expect(data.status).toBe(allUp ? 'UP' : 'DOWN');
    });

    it('should return 503 when database is DOWN', async () => {
      jest.spyOn(healthService as any, 'checkDatabase').mockResolvedValueOnce({ status: 'DOWN', error: 'Connection refused' });

      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);

      expect(response.body).toHaveProperty('statusCode', 503);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 503 when redis is DOWN', async () => {
      jest.spyOn(healthService as any, 'checkRedis').mockResolvedValueOnce({ status: 'DOWN', error: 'Redis unavailable' });

      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);

      expect(response.body).toHaveProperty('statusCode', 503);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 503 when bullmq is DOWN', async () => {
      jest.spyOn(healthService as any, 'checkBullMq').mockResolvedValueOnce({ status: 'DOWN', error: 'BullMQ unavailable' });

      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);

      expect(response.body).toHaveProperty('statusCode', 503);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 503 when all dependencies are DOWN', async () => {
      jest.spyOn(healthService as any, 'checkDatabase').mockResolvedValueOnce({ status: 'DOWN', error: 'DB down' });
      jest.spyOn(healthService as any, 'checkRedis').mockResolvedValueOnce({ status: 'DOWN', error: 'Redis down' });
      jest.spyOn(healthService as any, 'checkBullMq').mockResolvedValueOnce({ status: 'DOWN', error: 'BullMQ down' });

      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);

      expect(response.body).toHaveProperty('statusCode', 503);
      expect(response.body).toHaveProperty('message');
    });

    it('should not include error field when component is UP', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

      expect(response.body.data.database).not.toHaveProperty('error');
      expect(response.body.data.redis).not.toHaveProperty('error');
      expect(response.body.data.bullmq).not.toHaveProperty('error');
    });
  });
});
