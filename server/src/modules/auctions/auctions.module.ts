import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Bid, BidModule } from '@modules/bid';
import { UsersModule } from '@modules/users';
import { MailModule } from '@shared/mail';
import { AUCTION_END_QUEUE, AUCTION_START_QUEUE } from './auction.constants';
import { AuctionsRepository } from './repositories/auctions.repository';
import { AuctionStartProcessor } from './auctions-start.processor';
import { AuctionEndProcessor } from './auctions-end.processor';
import { AuctionsController } from './auctions.controller';
import { AuctionScheduler } from './auction.scheduler';
import { AuctionsService } from './auctions.service';
import { ENTITIES } from './entities';

@Module({
  controllers: [AuctionsController],
  imports: [TypeOrmModule.forFeature([...ENTITIES, Bid]), BullModule.registerQueue({ name: AUCTION_END_QUEUE }, { name: AUCTION_START_QUEUE }), BidModule, UsersModule, MailModule],
  providers: [AuctionsService, AuctionsRepository, AuctionScheduler, AuctionStartProcessor, AuctionEndProcessor],
  exports: [AuctionsService, AuctionScheduler, TypeOrmModule],
})
export class AuctionsModule {}
