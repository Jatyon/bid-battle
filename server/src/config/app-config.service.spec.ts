import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './config.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';

describe('AppConfigService', () => {
  let service: AppConfigService;
  let configService: DeepMocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppConfigService,
        {
          provide: ConfigService,
          useValue: createMock<ConfigService>(),
        },
      ],
    }).compile();

    service = module.get<AppConfigService>(AppConfigService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('app', () => {
    it('should return app config with values from configService', () => {
      configService.get.mockImplementation((key: string, defaultValue: any) => {
        const values = {
          NODE_ENV: 'production',
          NAME: 'Production App',
        };
        return values[key] || defaultValue;
      });

      const config = service.app;

      expect(config.mode).toBe('production');
      expect(config.name).toBe('Production App');
      expect(config.port).toBe(3000);
    });
  });

  describe('database', () => {
    it('should return database config with correct types', () => {
      configService.get.mockReturnValueOnce('mysql');
      configService.get.mockReturnValueOnce('db-host');

      const config = service.database;

      expect(config.type).toBe('mysql');
      expect(config.host).toBe('db-host');
      expect(config.entities).toContain('dist/**/*.entity.js');
    });
  });

  describe('i18n', () => {
    it('should return i18n config', () => {
      configService.get.mockReturnValueOnce('en');

      const config = service.i18n;

      expect(config.fallbackLanguage).toBe('en');
    });
  });

  describe('file', () => {
    it('should return file config', () => {
      configService.get.mockReturnValueOnce(5);

      const config = service.file;

      expect(config.avatarMaxSizeMB).toBe(5);
    });
  });

  describe('jwt', () => {
    it('should return jwt config', () => {
      configService.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'JWT_SECRET') return 'super-secret';
        return defaultValue;
      });

      const config = service.jwt;

      expect(config.secret).toBe('super-secret');
      expect(config.tokenLife).toBe(3600);
    });
  });

  describe('mailer', () => {
    it('should return mailer config with auth object', () => {
      configService.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'SMTP_USER') return 'user@test.com';
        return defaultValue;
      });

      const config = service.mailer;

      expect(config.auth.user).toBe('user@test.com');
      expect(config.from.name).toBe('No Reply');
    });
  });

  describe('redis', () => {
    it('should return redis config', () => {
      configService.get.mockReturnValue(6379);

      const config = service.redis;

      expect(config.port).toBe(6379);
    });
  });

  describe('stripe', () => {
    it('should return stripe config', () => {
      configService.get.mockReturnValue('sk_test_123');

      const config = service.stripe;

      expect(config.secretKey).toBe('sk_test_123');
    });
  });
});
