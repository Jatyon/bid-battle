import { Injectable } from '@nestjs/common';
import { Auction } from '../entities';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class AuctionsRepository extends Repository<Auction> {
  constructor(private readonly dataSource: DataSource) {
    super(Auction, dataSource.createEntityManager());
  }
}
