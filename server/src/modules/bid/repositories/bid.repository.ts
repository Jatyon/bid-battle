import { Injectable } from '@nestjs/common';
import { Bid } from '../entities';
import { DataSource, Repository } from 'typeorm';

interface RawBidRow {
  id: string | number;
  amount: string | number;
  auction_id: string | number;
  user_id: string | number;
  created_at: Date;
  updated_at: Date;
}

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

  async findByOrphanedIds(orphanedIds: number[]): Promise<Bid[]> {
    const placeholders = orphanedIds.map(() => '?').join(', ');

    const rows: RawBidRow[] = await this.query(
      `SELECT id, amount, auction_id, user_id, created_at, updated_at
       FROM (
         SELECT *,
                RANK() OVER (PARTITION BY auction_id ORDER BY amount DESC, id ASC) AS rnk
         FROM bids
         WHERE auction_id IN (${placeholders})
       ) ranked
       WHERE rnk = 1
       ORDER BY auction_id ASC`,
      orphanedIds,
    );

    return rows.map((row: RawBidRow) => {
      const bid = new Bid();
      bid.id = Number(row.id);
      bid.amount = Number(row.amount);
      bid.auctionId = Number(row.auction_id);
      bid.userId = Number(row.user_id);
      bid.createdAt = row.created_at;
      bid.updatedAt = row.updated_at;
      return bid;
    });
  }
}
