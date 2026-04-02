import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { AUCTION_END_QUEUE, AUCTION_START_QUEUE } from '@modules/auctions/auction.constants';
import { MAIL_QUEUE } from '@shared/mail';
import { RedisService } from '@shared/redis';
import { ComponentHealthDto, HealthDetailDto, HealthStatus } from './dto';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly redisService: RedisService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(AUCTION_START_QUEUE) private readonly auctionStartQueue: Queue,
    @InjectQueue(AUCTION_END_QUEUE) private readonly auctionEndQueue: Queue,
    @InjectQueue(MAIL_QUEUE) private readonly mailQueue: Queue,
  ) {}

  /**
   * Liveness probe — lightweight, no external calls.
   * Kubernetes/Docker: if this fails → restart the container.
   */
  isLive(): boolean {
    return true;
  }

  /**
   * Readiness probe — checks all external dependencies.
   * Kubernetes/Docker: if this fails → stop sending traffic (but don't restart).
   */
  async getReadiness(): Promise<HealthDetailDto> {
    const [database, redis, bullmq] = await Promise.all([this.checkDatabase(), this.checkRedis(), this.checkBullMq()]);

    const overallStatus: HealthStatus = database.status === 'UP' && redis.status === 'UP' && bullmq.status === 'UP' ? 'UP' : 'DOWN';

    return { status: overallStatus, database, redis, bullmq };
  }

  // ---------------------------------------------------------------------------

  private async checkDatabase(): Promise<ComponentHealthDto> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'UP', responseTimeMs: Date.now() - start };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Database health check failed', message);
      return { status: 'DOWN', error: message };
    }
  }

  private async checkRedis(): Promise<ComponentHealthDto> {
    try {
      const responseTimeMs = await this.redisService.ping();
      return { status: 'UP', responseTimeMs };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Redis health check failed', message);
      return { status: 'DOWN', error: message };
    }
  }

  private async checkBullMq(): Promise<ComponentHealthDto> {
    const start = Date.now();
    try {
      // getWorkers() issues a Redis command — proves BullMQ can reach its backend
      await Promise.all([this.auctionStartQueue.getWorkers(), this.auctionEndQueue.getWorkers(), this.mailQueue.getWorkers()]);
      return { status: 'UP', responseTimeMs: Date.now() - start };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('BullMQ health check failed', message);
      return { status: 'DOWN', error: message };
    }
  }
}
