import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { UsersModule } from '@modules/users';
import { AuthModule } from '@modules/auth';
import { BidRepository } from './repositories/bid.repository';
import { BidService } from './bid.service';
import { BidGateway } from './bid.gateway';
import { ENTITIES } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES), AuthModule, UsersModule],
  providers: [BidService, BidGateway, BidRepository],
  exports: [BidService, BidGateway, BidRepository],
})
export class BidModule {}
