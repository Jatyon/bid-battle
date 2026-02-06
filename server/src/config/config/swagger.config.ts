import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication, Logger } from '@nestjs/common';

export function setupSwagger(app: INestApplication) {
  const logger = new Logger('Swagger');

  const config = new DocumentBuilder()
    .setTitle('NestJS Auth API')
    .setDescription('API documentation for NestJS application with authentication features')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'jwt-auth',
    )
    .addTag('Health', 'Health checks')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const path = '/api/docs';

  SwaggerModule.setup(path, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none',
    },
  });

  logger.log(`Swagger documentation available at: ${path}`);
}
