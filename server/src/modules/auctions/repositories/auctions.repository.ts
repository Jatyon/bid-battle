import { Injectable } from '@nestjs/common';
import { SortOrder } from '@core/enums';
import { IAuctionFilters, IMyAuctionFilters } from '../interfaces';
import { AuctionSortBy, AuctionStatus } from '../enums';
import { Auction } from '../entities';
import { DataSource, Repository } from 'typeorm';
@Injectable()
export class AuctionsRepository extends Repository<Auction> {
  constructor(private readonly dataSource: DataSource) {
    super(Auction, dataSource.createEntityManager());
  }

  findActiveAuctions(skip: number, take: number, filters: IAuctionFilters = {}): Promise<[Auction[], number]> {
    const { search, category, minPrice, maxPrice, sortBy = AuctionSortBy.CREATED_AT, sortOrder = SortOrder.DESC, sellerId } = filters;

    const qb = this.createQueryBuilder('auction')
      .leftJoinAndSelect('auction.owner', 'owner')
      .leftJoinAndSelect('auction.winner', 'winner')
      .where('auction.status = :status', { status: AuctionStatus.ACTIVE });

    if (search?.trim()) qb.andWhere('MATCH(auction.title) AGAINST (:search IN BOOLEAN MODE)', { search: `${search.trim()}*` });

    if (category) qb.andWhere('auction.category = :category', { category });

    if (minPrice) qb.andWhere('auction.currentPrice >= :minPrice', { minPrice });

    if (maxPrice) qb.andWhere('auction.currentPrice <= :maxPrice', { maxPrice });

    if (sellerId) qb.andWhere('auction.ownerId = :sellerId', { sellerId });

    qb.orderBy(`auction.${sortBy}`, sortOrder).skip(skip).take(take);

    return qb.getManyAndCount();
  }

  findPaginatedAuctionsByOwner(ownerId: number, skip: number, take: number, filters: IMyAuctionFilters = {}): Promise<[Auction[], number]> {
    const { search, status, category, hasWinner, sortBy = AuctionSortBy.CREATED_AT, sortOrder = SortOrder.DESC } = filters;

    const qb = this.createQueryBuilder('auction').leftJoinAndSelect('auction.winner', 'winner').where('auction.ownerId = :ownerId', { ownerId });

    if (search?.trim()) qb.andWhere('auction.title LIKE :search', { search: `%${search.trim()}%` });

    if (status) qb.andWhere('auction.status = :status', { status });

    if (category) qb.andWhere('auction.category = :category', { category });

    if (hasWinner === true) qb.andWhere('auction.winnerId IS NOT NULL');
    else if (hasWinner === false) qb.andWhere('auction.winnerId IS NULL');

    const allowedSortFields: Record<AuctionSortBy, string> = {
      [AuctionSortBy.CREATED_AT]: 'auction.createdAt',
      [AuctionSortBy.END_TIME]: 'auction.endTime',
      [AuctionSortBy.CURRENT_PRICE]: 'auction.currentPrice',
      [AuctionSortBy.STARTING_PRICE]: 'auction.startingPrice',
    };
    const sortField = allowedSortFields[sortBy] ?? 'auction.createdAt';
    qb.orderBy(sortField, sortOrder).skip(skip).take(take);

    return qb.getManyAndCount();
  }

  findByIdWithRelations(auctionId: number): Promise<Auction | null> {
    return this.findOne({
      where: { id: auctionId },
      relations: ['owner', 'winner', 'images'],
    });
  }
}
