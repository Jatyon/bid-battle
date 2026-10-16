import { ApiProperty } from '@nestjs/swagger';
import { AuctionEventDto } from './auction-event-response.dto';

export class AuctionOutbidDto extends AuctionEventDto {
  @ApiProperty({
    description: 'The new highest bid amount that outbid the user',
    example: 1500,
  })
  newAmount: number;

  @ApiProperty({
    description: 'Title of the auction',
    example: 'Vintage Camera',
    required: false,
  })
  auctionTitle?: string;
}
