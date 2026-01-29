import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@app/app.module';
import { AppConfigService } from '@config/services/config.service';
import { setupSecurity } from '@config/config/security.config';
import { winstonConfig } from '@config/config/winston.config';
import { WinstonModule } from 'nest-winston';
import compression from 'compression';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });

  const configService = app.get(AppConfigService);

  setupSecurity(app);

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

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err) => {
  console.error('Error while starting the application:', err);
  process.exit(1);
});
