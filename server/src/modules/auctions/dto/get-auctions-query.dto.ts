import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetAuctionsQueryDto {
  @ApiProperty({
    description: 'Page number (starting from 1)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'error.validation.page_must_be_integer' })
  @Min(1, { message: 'error.validation.page_must_be_at_least_1' })
  page?: number = 1;

  @ApiProperty({
    description: 'Items per page',
    example: 10,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'error.validation.limit_must_be_integer' })
  @Min(1, { message: 'error.validation.limit_must_be_at_least_1' })
  limit?: number = 10;
}
