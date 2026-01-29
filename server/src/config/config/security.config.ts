import { INestApplication, Logger } from '@nestjs/common';
import { AppConfigService } from '@config/services/config.service';
import helmet from 'helmet';

export function setupSecurity(app: INestApplication) {
  const configService = app.get(AppConfigService);
  const logger = new Logger('SecuritySetup');

  const isProduction = configService.app.mode === 'production';
  const corsOrigins = configService.app.corsOrigin;

  const allowedOrigins = corsOrigins ? corsOrigins.split(',').map((o) => o.trim()) : [];

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'", "'unsafe-inline'", ...(isProduction ? [] : ["'unsafe-eval'"])],
        },
      },
    }),
  );

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (!isProduction && allowedOrigins.length === 0) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`Blocked CORS request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Disposition'],
  });

  logger.log(`Security headers configured. Production mode: ${isProduction}`);
  logger.log(`CORS allowed for: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'ALL (Dev only) or NONE'}`);
}
