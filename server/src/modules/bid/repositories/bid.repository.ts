import { Injectable } from '@nestjs/common';
import { SortOrder } from '@core/enums';
import { AuctionStatus } from '@modules/auctions/enums';
import { BidSortBy, MyBidStatusFilter } from '../enums';
import { IMyBidFilters } from '../interfaces';
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

  findPaginatedBidByUser(userId: number, skip: number, take: number, filters: IMyBidFilters = {}): Promise<[Bid[], number]> {
    const { search, category, auctionStatus, bidStatus, sortBy = BidSortBy.CREATED_AT, sortOrder = SortOrder.DESC } = filters;

    const qb = this.createQueryBuilder('bid').innerJoinAndSelect('bid.auction', 'auction').where('bid.userId = :userId', { userId });

    if (search?.trim()) qb.andWhere('auction.title LIKE :search', { search: `%${search.trim()}%` });

    if (category) qb.andWhere('auction.category = :category', { category });

    if (auctionStatus) qb.andWhere('auction.status = :auctionStatus', { auctionStatus });

    if (bidStatus) {
      switch (bidStatus) {
        case MyBidStatusFilter.WINNING:
          qb.andWhere('auction.status = :activeStatus', { activeStatus: AuctionStatus.ACTIVE }).andWhere('bid.amount >= auction.currentPrice');
          break;
        case MyBidStatusFilter.OUTBID:
          qb.andWhere('auction.status = :activeStatus', { activeStatus: AuctionStatus.ACTIVE }).andWhere('bid.amount < auction.currentPrice');
          break;
        case MyBidStatusFilter.WON:
          qb.andWhere('auction.status = :endedStatus', { endedStatus: AuctionStatus.ENDED }).andWhere('auction.winnerId = :userId', { userId });
          break;
        case MyBidStatusFilter.LOST:
          qb.andWhere('auction.status = :endedStatus', { endedStatus: AuctionStatus.ENDED }).andWhere('(auction.winnerId != :userId OR auction.winnerId IS NULL)', { userId });
          break;
      }
    }

    const allowedSortFields: Record<BidSortBy, string> = {
      [BidSortBy.CREATED_AT]: 'bid.createdAt',
      [BidSortBy.AMOUNT]: 'bid.amount',
      [BidSortBy.END_TIME]: 'auction.endTime',
      [BidSortBy.CURRENT_PRICE]: 'auction.currentPrice',
    };
    const sortField = allowedSortFields[sortBy] ?? 'bid.createdAt';
    qb.orderBy(sortField, sortOrder).skip(skip).take(take);

    return qb.getManyAndCount();
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
