import { ApiProperty } from '@nestjs/swagger';
import { AuctionEventDto } from './auction-event-response.dto';

export class NewHighestBidDto extends AuctionEventDto {
  @ApiProperty({
    description: 'The new highest bid amount expressed as a whole integer in the smallest currency unit (e.g. grosz: 1230 = 12.30 PLN).',
    example: 1230,
  })
  amount: number;
}
