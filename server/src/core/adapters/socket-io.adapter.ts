import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppConfigService } from '@config/config.service';
import { Server, ServerOptions } from 'socket.io';

/**
 * Custom Socket.IO adapter that reads the allowed CORS origins from
 * the application configuration instead of hardcoding them in the
 * @WebSocketGateway decorator.
 *
 * This ensures that WebSocket connections are subject to the same
 * origin policy as regular HTTP requests configured via CORS_ORIGIN.
 */
export class SocketIoAdapter extends IoAdapter {
  private readonly logger = new Logger(SocketIoAdapter.name);
  private readonly allowedOrigins: string[];
  private readonly isProduction: boolean;

  constructor(app: INestApplicationContext) {
    super(app);

    const configService = app.get(AppConfigService);

    this.isProduction = configService.app.mode === 'production';
    this.allowedOrigins = configService.app.corsOrigin
      ? configService.app.corsOrigin
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : [];

    this.logger.log(`WebSocket CORS configured. Allowed origins: ${this.allowedOrigins.length > 0 ? this.allowedOrigins.join(', ') : 'ALL (dev only)'}`);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const corsOptions: ServerOptions['cors'] = {
      credentials: true,
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) return callback(null, true);

        if (!this.isProduction && this.allowedOrigins.length === 0) return callback(null, true);

        if (this.allowedOrigins.includes(origin) || this.allowedOrigins.includes('*')) return callback(null, true);

        this.logger.warn(`Blocked WebSocket connection from origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
      },
    };

    return super.createIOServer(port, { ...options, cors: corsOptions }) as Server;
  }
}
