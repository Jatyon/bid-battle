import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@app/app.module';
import { TransformInterceptor } from '@core/interceptors/transform.interceptor';
import { LoggingInterceptor } from '@core/interceptors/logging.interceptor';
import { TimeoutInterceptor } from '@core/interceptors/timeout.interceptor';
import { HttpExceptionFilter } from '@core/filters/http-exception.filter';
import { AppConfigService } from '@config/services/config.service';
import { setupSecurity } from '@config/config/security.config';
import { winstonConfig } from '@config/config/winston.config';
import { setupSwagger } from '@config/config/swagger.config';
import { WinstonModule } from 'nest-winston';
import { I18nService } from 'nestjs-i18n';
import compression from 'compression';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });

  const logger = new Logger('APP');

  const configService = app.get(AppConfigService);

  setupSecurity(app);

  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({
    origin: configService.app.corsOrigin,
    credentials: true,
  });

  app.use(compression());

  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter(app.get(I18nService), configService));

  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor(), new TimeoutInterceptor(configService.app.timeoutMs));

  const host = configService.app.host;
  const port = configService.app.port;

  setupSwagger(app);

  await app.listen(port);

  logger.log(`Application is running on: ${host}:${port}`);
  logger.log(`Swagger docs: ${host}:${port}/api/docs`);
}
bootstrap().catch((err) => {
  console.error('Error while starting the application:', err);
  process.exit(1);
});
