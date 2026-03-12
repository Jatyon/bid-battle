import { Injectable } from '@nestjs/common';
import { AuctionsRepository } from './repositories/auctions.repository';

@Injectable()
export class AuctionsService {
  constructor(private readonly auctionsRepository: AuctionsRepository) {}
}
