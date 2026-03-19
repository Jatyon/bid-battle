import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { BidService } from './bid.service';
import { ENTITIES } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  providers: [BidService],
  exports: [BidService],
})
export class BidModule {}
