import { ApiProperty } from '@nestjs/swagger';
import { AUCTION_PRICE_MAX } from '@modules/auctions/auction.constants';
import { IsInt, Min, Max } from 'class-validator';

export class PlaceBidDto {
  @ApiProperty({
    description: 'Bid amount expressed as a whole integer in the smallest currency unit ' + '(e.g. grosz: 100 = 1.00 PLN). Must be between 1 and 999 999 999.',
    example: 2500,
  })
  @IsInt({ message: 'error.validation.bid.amount_must_be_integer' })
  @Min(1, { message: 'error.validation.bid.amount_must_be_positive' })
  @Max(AUCTION_PRICE_MAX, { message: 'error.validation.bid.amount_too_high' })
  amount: number;
}
