import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { AuctionsRepository } from './repositories/auctions.repository';
import { AuctionsController } from './auctions.controller';
import { AuctionsService } from './auctions.service';
import { ENTITIES } from './entities';

@Module({
  controllers: [AuctionsController],
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  providers: [AuctionsService, AuctionsRepository],
  exports: [AuctionsService, TypeOrmModule],
})
export class AuctionsModule {}
