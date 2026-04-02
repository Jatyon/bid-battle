import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { StorageType } from '@shared/file-upload';
import { IConfigApp, IConfigBid, IConfigFile, IConfigGoogle, IConfigI18n, IConfigJWT, IConfigMailer, IConfigRedis, IConfigSocket, IDatabaseConfig } from './interfaces';
import { DatabaseType } from 'typeorm';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  private requireGet<T = string>(key: string): T {
    const value = this.configService.get<T>(key);

    if (value === undefined || value === null || value === '') throw new Error(`Missing required environment variable: ${key}`);

    return value;
  }

  get app(): IConfigApp {
    return {
      mode: this.configService.get<string>('NODE_ENV', 'development'),
      name: this.configService.get<string>('NAME', 'Test App'),
      host: this.configService.get<string>('HOST', 'http://localhost'),
      frontendHost: this.configService.get<string>('FRONTEND_HOST', 'http://localhost:4200'),
      port: this.configService.get<number>('PORT', 3000),
      timeoutMs: this.configService.get<number>('TIMEOUT_MS', 5000),
      throttleTtlMs: this.configService.get<number>('THROTTLE_TTL_MS', 60000),
      throttleLimit: this.configService.get<number>('THROTTLE_LIMIT', 10),
      corsOrigin: this.requireGet<string>('CORS_ORIGIN'),
      emailVerificationExpiresInMin: this.configService.get<number>('EMAIL_VERIFICATION_EXPIRES_IN', 15),
      resetPasswordExpiresInMin: this.configService.get<number>('RESET_PASSWORD_EXPIRES_IN', 15),
    };
  }

  get database(): IDatabaseConfig {
    return {
      type: this.configService.get<DatabaseType>('DATABASE_TYPE', 'mysql'),
      host: this.configService.get<string>('DATABASE_HOST', 'localhost'),
      port: this.configService.get<number>('DATABASE_PORT', 3306),
      username: this.requireGet<string>('DATABASE_USER'),
      password: this.requireGet<string>('DATABASE_PASSWORD'),
      database: this.configService.get<string>('DATABASE_NAME', 'app_db'),
      entities: ['dist/**/*.entity.js'],
      migrations: ['dist/database/migrations/*.js'],
      seeds: ['dist/database/seeds/*.js'],
      synchronize: false,
      migrationsRun: false,
    };
  }

  get i18n(): IConfigI18n {
    return {
      fallbackLanguage: this.configService.get<string>('I18N_FALLBACK_LANGUAGE', 'en'),
    };
  }

  get file(): IConfigFile {
    return {
      avatarMaxSizeMB: this.configService.get<number>('AVATAR_MAX_SIZE_MB', 5),
      auctionImageMaxSizeMB: this.configService.get<number>('AUCTION_IMAGE_MAX_SIZE_MB', 10),
      allowedImageTypes: this.configService.get<string>('ALLOWED_IMAGE_TYPES', 'image/jpeg,image/png').split(','),
      uploadsDir: this.configService.get<string>('UPLOADS_DIR', 'uploads'),
      storageType: this.configService.get<StorageType>('STORAGE_TYPE', 'local'),
    };
  }

  get jwt(): IConfigJWT {
    return {
      tokenLife: this.configService.get<string>('JWT_EXPIRES_IN', '1d'),
      refreshTokenLife: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      secret: this.requireGet<string>('JWT_SECRET'),
      refreshSecret: this.requireGet<string>('JWT_REFRESH_SECRET'),
      saltOrRounds: this.requireGet<number>('JWT_SALT_OR_ROUNDS'),
    };
  }

  get mailer(): IConfigMailer {
    {
      return {
        host: this.configService.get<string>('SMTP_HOST', 'localhost'),
        port: this.configService.get<number>('SMTP_PORT', 587),
        ignoreTLS: this.configService.get<boolean>('SMTP_IGNORE_TLS', false),
        secure: this.configService.get<boolean>('SMTP_SECURE', false),
        auth: {
          user: this.configService.get<string>('SMTP_USER', ''),
          pass: this.configService.get<string>('SMTP_PASSWORD', ''),
        },
        from: {
          name: this.configService.get<string>('SMTP_FROM_NAME', 'No Reply'),
          address: this.configService.get<string>('SMTP_FROM_ADDRESS', ''),
        },
      };
    }
  }

  get redis(): IConfigRedis {
    {
      return {
        host: this.configService.get<string>('REDIS_HOST', 'localhost'),
        port: this.configService.get<number>('REDIS_PORT', 6379),
        password: this.configService.get<string>('REDIS_PASSWORD', ''),
        ttl: this.configService.get<number>('REDIS_TTL', 300),
      };
    }
  }

  get socket(): IConfigSocket {
    {
      return {
        windowMs: this.configService.get<number>('WS_RATE_LIMIT_MS', 10000),
        maxEvents: this.configService.get<number>('WS_RATE_LIMIT_MAX', 10),
      };
    }
  }

  get bid(): IConfigBid {
    return {
      minIncrementPercent: this.configService.get<number>('BID_MIN_INCREMENT_PERCENT', 1),
      minIncrementAbsolute: this.configService.get<number>('BID_MIN_INCREMENT_ABSOLUTE', 0.01),
    };
  }

  get google(): IConfigGoogle {
    return {
      clientId: this.requireGet<string>('GOOGLE_CLIENT_ID'),
      clientSecret: this.requireGet<string>('GOOGLE_CLIENT_SECRET'),
      callbackUrl: this.requireGet<string>('GOOGLE_CALLBACK_URL'),
    };
  }
}
