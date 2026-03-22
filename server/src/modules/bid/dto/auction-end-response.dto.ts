import { ApiProperty } from '@nestjs/swagger';
import { AuctionEventDto } from './auction-event-response.dto';

export class AuctionEndDto extends AuctionEventDto {
  @ApiProperty({
    description: 'The final closing price of the auction',
    example: 1250,
  })
  finalPrice: number | undefined;
}
