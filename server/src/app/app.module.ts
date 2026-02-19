import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AppController } from '@app/app.controller';
import { AppService } from '@app/app.service';
import { validationSchema } from '@config/validators/validation.schema';
import { AppConfigService } from '@config/services/config.service';
import { AppConfigModule } from '@config/config.module';
import { UsersModule } from '@modules/users/users.module';
import { MailModule } from '@modules/mail/mail.module';
import { AuthModule } from '@modules/auth/auth.module';
import { MailerConfigProvider } from '@shared/providers/mailer-config.provider';
import { I18nConfigProvider } from '@shared/providers/i18n-config.provider';
import { ProvidersModule } from '@shared/providers/providers.module';
import { HealthController } from '@health/controllers/health.controller';
import { AcceptLanguageResolver, I18nJsonLoader, I18nModule } from 'nestjs-i18n';

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

    AppConfigModule.forRoot(),

    // Global
    ProvidersModule,
    MailModule,

    // Modules
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
