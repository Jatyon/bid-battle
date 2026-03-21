import { ApiProperty } from '@nestjs/swagger';
import { AuctionEventDto } from './auction-event-response.dto';

export class NewHighestBidDto extends AuctionEventDto {
  @ApiProperty({
    description: 'The new highest bid amount for the auction',
    example: 123,
  })
  amount: number;
}
