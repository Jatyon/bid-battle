import { ApiProperty } from '@nestjs/swagger';
import { auctionEventDto } from './auction-event-response.dto';

export class newHighestBidDto extends auctionEventDto {
  @ApiProperty({
    description: 'The new highest bid amount for the auction',
    example: 123,
  })
  amount: number;
}
