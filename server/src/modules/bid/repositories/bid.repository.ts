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

  findPaginatedBidByUser(userId: number, skip: number, take: number): Promise<[Bid[], number]> {
    return this.findAndCount({
      where: { userId },
      relations: ['auction'],
      order: { amount: 'DESC' },
      skip,
      take,
    });
  }

  findByOrphanedIds(orphanedIds: number[]): Promise<Bid[]> {
    return this.createQueryBuilder('bid')
      .distinctOn(['bid.auctionId'])
      .where('bid.auctionId IN (:...ids)', { ids: orphanedIds })
      .orderBy('bid.auctionId', 'ASC')
      .addOrderBy('bid.amount', 'DESC')
      .getMany();
  }
}
