import { Injectable } from '@nestjs/common';
import { Bid } from '../entities';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class BidRepository extends Repository<Bid> {
  constructor(private readonly dataSource: DataSource) {
    super(Bid, dataSource.createEntityManager());
  }

  findPaginatedBidByAuction(auctionId: number, skip: number, take: number): Promise<[Bid[], number]> {
    return this.findAndCount({
      where: { auctionId },
      relations: ['user'],
      order: { amount: 'DESC' },
      skip,
      take,
    });
  }
}
