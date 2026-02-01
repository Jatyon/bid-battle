import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { IDatabaseConfig } from '@config/interfaces/database-config.interface';
import { IConfigMailer } from '@config/interfaces/mailer-config.interface';
import { IConfigStripe } from '@config/interfaces/stripe-config.interface';
import { IConfigRedis } from '@config/interfaces/redis-config.interface';
import { IConfigI18n } from '@config/interfaces/i18n-config.interface';
import { IConfigFile } from '@config/interfaces/file-config.interface';
import { IConfigApp } from '@config/interfaces/app-config.interface';
import { IConfigJWT } from '@config/interfaces/jwt-config.interface';
import { DatabaseType } from 'typeorm';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

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
      corsOrigin: this.configService.get<string>('CORS_ORIGIN', '*'),
      emailVerificationExpiresInMin: this.configService.get<number>('EMAIL_VERIFICATION_EXPIRES_IN', 15),
      resetPasswordExpiresInMin: this.configService.get<number>('RESET_PASSWORD_EXPIRES_IN', 15),
    };
  }

  get database(): IDatabaseConfig {
    return {
      type: this.configService.get<DatabaseType>('DATABASE_TYPE', 'mysql'),
      host: this.configService.get<string>('DATABASE_HOST', 'localhost'),
      port: this.configService.get<number>('DATABASE_PORT', 3306),
      username: this.configService.get<string>('DATABASE_USER', 'root'),
      password: this.configService.get<string>('DATABASE_PASSWORD', 'password'),
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
    };
  }

  get jwt(): IConfigJWT {
    return {
      tokenLife: this.configService.get<number>('JWT_EXPIRES_IN', 3600),
      refreshTokenLife: this.configService.get<number>('JWT_REFRESH_EXPIRES_IN', 7 * 24 * 3600),
      secret: this.configService.get<string>('JWT_SECRET', 'defaultSecret'),
      salt: this.configService.get<string>('JWT_SALT', 'defaultSalt'),
      saltOrRounds: this.configService.get<number>('JWT_SALT_OR_ROUNDS', 10),
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

  get stripe(): IConfigStripe {
    return {
      secretKey: this.configService.get<string>('STRIPE_SECRET_KEY', ''),
      currency: this.configService.get<string>('STRIPE_CURRENCY', 'usd'),
    };
  }
}
