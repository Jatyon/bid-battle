import { ApiProperty } from '@nestjs/swagger';

export class AuctionEventDto {
  @ApiProperty({
    description: 'The ID of the auction',
    example: 123,
  })
  auctionId: number;

  @ApiProperty({})
  timestamp: string;
}
