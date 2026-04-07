import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@app/app.module';
import { LoggingInterceptor, TimeoutInterceptor, TransformInterceptor } from '@core/interceptors';
import { HttpExceptionFilter } from '@core/filters/http-exception.filter';
import { SocketIoAdapter } from '@core/adapters/socket-io.adapter';
import { setupBullBoard, setupSecurity, setupSwagger, winstonConfig } from '@config/config';
import { AppConfigService } from '@config/config.service';
import { AUCTION_END_QUEUE, AUCTION_START_QUEUE } from '@modules/auctions/auction.constants';
import { MAIL_QUEUE } from '@shared/mail/mail.constants';
import { Request, Response, NextFunction } from 'express';
import { WinstonModule } from 'nest-winston';
import { I18nService } from 'nestjs-i18n';
import compression from 'compression';
import * as express from 'express';
import { Queue } from 'bullmq';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });

  const logger = new Logger('APP');

  const configService = app.get(AppConfigService);

  const bullQueues = [app.get<Queue>(getQueueToken(AUCTION_START_QUEUE)), app.get<Queue>(getQueueToken(AUCTION_END_QUEUE)), app.get<Queue>(getQueueToken(MAIL_QUEUE))];
  setupBullBoard(app, bullQueues);

  setupSecurity(app);

  app.useWebSocketAdapter(new SocketIoAdapter(app));

  app.set('trust proxy', 1);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  app.use(compression());

  // Static file guard — block path traversal and directory listing attempts on /uploads
  app.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
    const requestedPath = req.path;
    const normalizedPath = path.normalize(requestedPath);

    if (normalizedPath !== requestedPath) return res.status(403).json({ statusCode: 403, message: 'Forbidden' });

    const lastSegment = path.basename(normalizedPath);

    if (!lastSegment.includes('.')) return res.status(403).json({ statusCode: 403, message: 'Forbidden' });

    next();
  });

  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
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
