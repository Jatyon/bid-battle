import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class PlaceBidDto {
  @ApiProperty({
    description: 'Bid amount',
    example: 250,
  })
  @IsNumber({}, { message: 'error.validation.bid.amount_must_be_number' })
  amount: number;
}
