import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AUCTION_END_QUEUE, AUCTION_START_QUEUE } from '@modules/auctions/auction.constants';
import { MAIL_QUEUE } from '@shared/mail';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [BullModule.registerQueue({ name: AUCTION_START_QUEUE }, { name: AUCTION_END_QUEUE }, { name: MAIL_QUEUE })],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
