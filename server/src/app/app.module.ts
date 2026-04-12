import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { validationSchema } from '@config/validators/validation.schema';
import { AppConfigService } from '@config/config.service';
import { AppConfigModule } from '@config/config.module';
import { AuctionsModule } from '@modules/auctions';
import { UsersModule } from '@modules/users';
import { AuthModule } from '@modules/auth';
import { BidModule } from '@modules/bid';
import { HealthModule } from '@health/health.module';
import { I18nConfigProvider, MailerConfigProvider, ProvidersModule } from '@shared/providers';
import { FileUploadModule } from '@shared/file-upload';
import { RedisModule } from '@shared/redis';
import { MailModule } from '@shared/mail';
import { AcceptLanguageResolver, I18nJsonLoader, I18nModule } from 'nestjs-i18n';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) =>
        ({
          ...configService.database,
          autoLoadEntities: true,
        }) as TypeOrmModuleOptions,
    }),
    I18nModule.forRootAsync({
      useClass: I18nConfigProvider,
      loader: I18nJsonLoader,
      resolvers: [AcceptLanguageResolver],
    }),
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => [
        {
          ttl: config.app.throttleTtlMs,
          limit: config.app.throttleLimit,
        },
      ],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) => ({
        connection: {
          host: configService.redis.host,
          port: configService.redis.port,
          password: configService.redis.password,
        },
      }),
    }),
    MailerModule.forRootAsync({
      useClass: MailerConfigProvider,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),

    AppConfigModule.forRoot(),

    // Global
    RedisModule,
    ProvidersModule,
    MailModule,
    FileUploadModule,

    // Modules
    AuctionsModule,
    AuthModule,
    BidModule,
    UsersModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
