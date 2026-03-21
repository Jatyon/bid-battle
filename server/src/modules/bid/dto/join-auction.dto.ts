import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class JoinAuctionDto {
  @ApiProperty({
    description: 'The ID of the auction the user wants to join',
    example: 123,
  })
  @IsInt({ message: 'error.validation.bid.auction_id_must_be_integer' })
  @IsPositive({ message: 'error.validation.bid.auction_id_must_be_positive' })
  auctionId: number;
}
