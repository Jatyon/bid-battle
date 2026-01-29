import { NestFactory } from '@nestjs/core';
import { AppModule } from '@app/app.module';
import { winstonConfig } from '@config/config/winston.config';
import { WinstonModule } from 'nest-winston';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
