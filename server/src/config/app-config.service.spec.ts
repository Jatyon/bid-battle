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
        const values: Record<string, any> = {
          NODE_ENV: 'production',
          NAME: 'Production App',
          CORS_ORIGIN: 'https://bidapp.com',
        };
        return values[key] !== undefined ? values[key] : defaultValue;
      });

      const config = service.app;

      expect(config.mode).toBe('production');
      expect(config.name).toBe('Production App');
      expect(config.port).toBe(3000);
      expect(config.corsOrigin).toBe('https://bidapp.com');
    });

    it('should throw when CORS_ORIGIN is missing', () => {
      configService.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'CORS_ORIGIN') return undefined;
        return defaultValue || 'some-value';
      });

      expect(() => service.app).toThrow('Missing required environment variable: CORS_ORIGIN');
    });
  });

  describe('database', () => {
    it('should return database config with correct types', () => {
      configService.get.mockImplementation((key: string) => {
        const values: Record<string, unknown> = {
          DATABASE_TYPE: 'mysql',
          DATABASE_HOST: 'db-host',
          DATABASE_USER: 'db-user',
          DATABASE_PASSWORD: 'db-pass',
        };
        return values[key];
      });

      const config = service.database;

      expect(config.type).toBe('mysql');
      expect(config.host).toBe('db-host');
      expect(config.username).toBe('db-user');
      expect(config.password).toBe('db-pass');
      expect(config.entities).toContain('dist/**/*.entity.js');
    });

    it('should throw when DATABASE_USER is missing', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DATABASE_USER') return undefined;
        return 'value';
      });

      expect(() => service.database).toThrow('Missing required environment variable: DATABASE_USER');
    });

    it('should throw when DATABASE_PASSWORD is missing', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DATABASE_PASSWORD') return undefined;
        if (key === 'DATABASE_USER') return 'user';
        return 'value';
      });

      expect(() => service.database).toThrow('Missing required environment variable: DATABASE_PASSWORD');
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
    it('should return jwt config with required secrets', () => {
      configService.get.mockImplementation((key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          JWT_SECRET: 'super-secret-key-with-at-least-32-chars!!',
          JWT_REFRESH_SECRET: 'super-refresh-secret-key-32-chars!!',
          JWT_SALT_OR_ROUNDS: 12,
        };
        return values[key] ?? defaultValue;
      });

      const config = service.jwt;

      expect(config.secret).toBe('super-secret-key-with-at-least-32-chars!!');
      expect(config.refreshSecret).toBe('super-refresh-secret-key-32-chars!!');
      expect(config.saltOrRounds).toBe(12);
      expect(config.tokenLife).toBe('1d');
    });

    it('should throw when JWT_SECRET is missing', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return undefined;
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret-key-32-chars-long!!';
        if (key === 'JWT_SALT_OR_ROUNDS') return 12;
        return undefined;
      });

      expect(() => service.jwt).toThrow('Missing required environment variable: JWT_SECRET');
    });

    it('should throw when JWT_REFRESH_SECRET is missing', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return 'secret-key-with-at-least-32-chars!!';
        if (key === 'JWT_REFRESH_SECRET') return undefined;
        if (key === 'JWT_SALT_OR_ROUNDS') return 12;
        return undefined;
      });

      expect(() => service.jwt).toThrow('Missing required environment variable: JWT_REFRESH_SECRET');
    });

    it('should throw when JWT_SALT_OR_ROUNDS is missing', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return 'secret-key-with-at-least-32-chars!!';
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret-key-32-chars-long!!';
        if (key === 'JWT_SALT_OR_ROUNDS') return undefined;
        return undefined;
      });

      expect(() => service.jwt).toThrow('Missing required environment variable: JWT_SALT_OR_ROUNDS');
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

  describe('socket', () => {
    it('should return socket config with default values', () => {
      configService.get.mockImplementation((key: string, defaultValue: any) => defaultValue);

      const config = service.socket;

      expect(config.windowMs).toBe(10000);
      expect(config.maxEvents).toBe(10);
    });

    it('should return socket config with custom values', () => {
      configService.get.mockImplementation((key: string, defaultValue: any) => {
        const values: Record<string, unknown> = {
          WS_RATE_LIMIT_MS: 5000,
          WS_RATE_LIMIT_MAX: 20,
        };
        return values[key] ?? defaultValue;
      });

      const config = service.socket;

      expect(config.windowMs).toBe(5000);
      expect(config.maxEvents).toBe(20);
    });
  });

  describe('bid', () => {
    it('should return bid config with default values', () => {
      configService.get.mockImplementation((key: string, defaultValue: any) => defaultValue);

      const config = service.bid;

      expect(config.minIncrementPercent).toBe(1);
      expect(config.minIncrementAbsolute).toBe(0.01);
    });

    it('should return bid config with custom values', () => {
      configService.get.mockImplementation((key: string, defaultValue: any) => {
        const values: Record<string, unknown> = {
          BID_MIN_INCREMENT_PERCENT: 5,
          BID_MIN_INCREMENT_ABSOLUTE: 0.5,
        };
        return values[key] ?? defaultValue;
      });

      const config = service.bid;

      expect(config.minIncrementPercent).toBe(5);
      expect(config.minIncrementAbsolute).toBe(0.5);
    });
  });

  describe('google', () => {
    it('should return google config when all env vars are set', () => {
      configService.get.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'my-client-id',
          GOOGLE_CLIENT_SECRET: 'my-client-secret',
          GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/google/callback',
        };
        return values[key];
      });

      const config = service.google;

      expect(config.clientId).toBe('my-client-id');
      expect(config.clientSecret).toBe('my-client-secret');
      expect(config.callbackUrl).toBe('http://localhost:3000/auth/google/callback');
    });

    it('should throw when GOOGLE_CLIENT_ID is missing', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return undefined;
        return 'some-value';
      });

      expect(() => service.google).toThrow('Missing required environment variable: GOOGLE_CLIENT_ID');
    });

    it('should throw when GOOGLE_CLIENT_SECRET is missing', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'my-client-id';
        if (key === 'GOOGLE_CLIENT_SECRET') return undefined;
        return 'some-value';
      });

      expect(() => service.google).toThrow('Missing required environment variable: GOOGLE_CLIENT_SECRET');
    });

    it('should throw when GOOGLE_CALLBACK_URL is missing', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'my-client-id';
        if (key === 'GOOGLE_CLIENT_SECRET') return 'my-client-secret';
        if (key === 'GOOGLE_CALLBACK_URL') return undefined;
        return 'some-value';
      });

      expect(() => service.google).toThrow('Missing required environment variable: GOOGLE_CALLBACK_URL');
    });
  });
});
