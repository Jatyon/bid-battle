import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class PlaceBidDto {
  @ApiProperty({
    description: 'Bid amount (integer, minimum value: 1)',
    example: 250,
    minimum: 1,
  })
  @IsInt({ message: 'error.validation.bid.amount_must_be_integer' })
  @Min(1, { message: 'error.validation.bid.amount_must_be_at_least_1' })
  amount: number;
}
