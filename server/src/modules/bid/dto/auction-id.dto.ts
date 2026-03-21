import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class AuctionIdDto {
  @ApiProperty({
    description: 'The ID of the auction',
    example: 123,
  })
  @IsInt({ message: 'error.validation.bid.auction_id_must_be_integer' })
  @IsPositive({ message: 'error.validation.bid.auction_id_must_be_positive' })
  auctionId: number;
}
