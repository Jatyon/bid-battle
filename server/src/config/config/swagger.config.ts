import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication, Logger } from '@nestjs/common';

export function setupSwagger(app: INestApplication) {
  const logger = new Logger('Swagger');

  const config = new DocumentBuilder()
    .setTitle('Bid App API')
    .setDescription('Complete API documentation for Bid App backend application')
    .setVersion('1.0')
    .addServer('http://localhost:3000', 'Development server')
    .addServer('https://api.bidapp.com', 'Production server')
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
    .addTag('Health', 'Health check endpoints')
    .addTag('Authentication', 'User authentication and authorization')
    .addTag('Users', 'User profile and management')
    .addTag('Mail Testing', 'Email testing functionality')
    .addTag('Auctions', 'Auction management and bidding')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  });

  const path = '/api/docs';

  SwaggerModule.setup(path, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: 'Bid App API Documentation',
  });

  logger.log(`Swagger documentation available at: ${path}`);
}
