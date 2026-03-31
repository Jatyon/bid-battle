import { ApiProperty } from '@nestjs/swagger';
import { AuctionEventDto } from './auction-event-response.dto';

export class AuctionEndDto extends AuctionEventDto {
  @ApiProperty({
    description: 'The final closing price of the auction expressed as a whole integer in the smallest currency unit (e.g. grosz: 1250 = 12.50 PLN).',
    example: 1250,
  })
  finalPrice: number | undefined;
}
