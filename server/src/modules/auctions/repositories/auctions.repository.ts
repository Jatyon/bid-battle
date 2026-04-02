import { Injectable } from '@nestjs/common';
import { SortOrder } from '@core/enums';
import { AuctionSortBy, AuctionStatus } from '../enums';
import { IAuctionFilters } from '../interfaces';
import { Auction } from '../entities';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class AuctionsRepository extends Repository<Auction> {
  constructor(private readonly dataSource: DataSource) {
    super(Auction, dataSource.createEntityManager());
  }

  findActiveAuctions(skip: number, take: number, filters: IAuctionFilters = {}): Promise<[Auction[], number]> {
    const { search, minPrice, maxPrice, sortBy = AuctionSortBy.CREATED_AT, sortOrder = SortOrder.DESC } = filters;

    const qb = this.createQueryBuilder('auction')
      .leftJoinAndSelect('auction.owner', 'owner')
      .leftJoinAndSelect('auction.winner', 'winner')
      .where('auction.status = :status', { status: AuctionStatus.ACTIVE });

    if (search?.trim()) qb.andWhere('auction.title LIKE :search', { search: `%${search.trim()}%` });

    if (minPrice) qb.andWhere('auction.currentPrice >= :minPrice', { minPrice });

    if (maxPrice) qb.andWhere('auction.currentPrice <= :maxPrice', { maxPrice });

    qb.orderBy(`auction.${sortBy}`, sortOrder).skip(skip).take(take);

    return qb.getManyAndCount();
  }

  findPaginatedAuctionsByOwner(ownerId: number, skip: number, take: number): Promise<[Auction[], number]> {
    return this.findAndCount({
      where: { ownerId },
      skip,
      take,
      order: { createdAt: 'DESC' },
    });
  }

  findByIdWithRelations(auctionId: number): Promise<Auction | null> {
    return this.findOne({
      where: { id: auctionId },
      relations: ['owner', 'winner', 'images'],
    });
  }
}
