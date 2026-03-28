import { Bid } from '../../bid/entities/bid.entity';
import { ApiProperty } from '@nestjs/swagger';
import { AuctionResponse } from '@modules/auctions';
import { BidResponse } from './bid-response.dto';

export class MyBidResponse extends BidResponse {
  @ApiProperty({
    description: 'Auction details',
    type: () => AuctionResponse,
    nullable: true,
  })
  auction?: AuctionResponse;

  constructor(bid: Bid) {
    super(bid, false);

    if (bid.auction) this.auction = new AuctionResponse(bid.auction, false, false);
  }
}
