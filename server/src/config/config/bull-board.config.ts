import { INestApplication, Logger } from '@nestjs/common';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { AppConfigService } from '@config/config.service';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { Queue } from 'bullmq';

/**
 * Mounts the Bull Board queue dashboard at `/admin/queues`.
 *
 * @remarks
 * - **Development** – accessible without credentials for ease of use.
 * - **Production**  – protected by HTTP Basic Auth using `BULL_BOARD_USER`
 *   and `BULL_BOARD_PASSWORD` environment variables. If these are not set
 *   the board is **disabled** in production to prevent accidental exposure.
 *
 * The board is always excluded from the global API prefix and versioning so
 * it is reachable at the plain path regardless of `api/v1/…` routing.
 *
 * @param app     - The bootstrapped NestJS Express application.
 * @param queues  - BullMQ `Queue` instances to display on the board.
 */
export function setupBullBoard(app: INestApplication, queues: Queue[]): void {
  const logger = new Logger('BullBoard');
  const configService = app.get(AppConfigService);
  const isProduction = configService.app.mode === 'production';

  const user = process.env.BULL_BOARD_USER;
  const password = process.env.BULL_BOARD_PASSWORD;

  if (isProduction && (!user || !password)) {
    logger.warn('Bull Board disabled in production — missing credentials');
    return;
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });

  const router = serverAdapter.getRouter() as RequestHandler;

  if (isProduction && user && password) app.use('/admin/queues', basicAuth(user, password), router);
  else app.use('/admin/queues', router);

  logger.log(`Bull Board available at: /admin/queues`);
}

/**
 * Minimal HTTP Basic Auth middleware — avoids pulling in `express-basic-auth`
 * as a runtime dependency just for this single protected route.
 */
function basicAuth(expectedUser: string, expectedPassword: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
      res.status(401).send('Authentication required');
      return;
    }

    const base64 = authHeader.slice(6);
    const [user, pass] = Buffer.from(base64, 'base64').toString('utf-8').split(':');

    if (user !== expectedUser || pass !== expectedPassword) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
      res.status(401).send('Invalid credentials');
      return;
    }

    next();
  };
}
