import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AppController } from '@app/app.controller';
import { AppService } from '@app/app.service';
import { validationSchema } from '@config/validators/validation.schema';
import { AppConfigService } from '@config/services/config.service';
import { AppConfigModule } from '@config/config.module';
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

    AppConfigModule.forRoot(),

    // Global
    ProvidersModule,
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
