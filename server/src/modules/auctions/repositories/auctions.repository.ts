import { Injectable } from '@nestjs/common';
import { AuctionStatus } from '../enums';
import { Auction } from '../entities';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class AuctionsRepository extends Repository<Auction> {
  constructor(private readonly dataSource: DataSource) {
    super(Auction, dataSource.createEntityManager());
  }

  findActiveAuctions(skip: number, take: number): Promise<[Auction[], number]> {
    return this.findAndCount({
      where: { status: AuctionStatus.ACTIVE },
      relations: ['owner', 'winner'],
      skip,
      take,
      order: { createdAt: 'DESC' },
    });
  }
}
