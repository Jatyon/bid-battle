import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsInt, Min, Max, MinLength } from 'class-validator';

export class BaseSearchDto {
  @ApiPropertyOptional({ description: 'Search query string', example: 'Bike' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  q?: string;

  @ApiPropertyOptional({ description: 'Maximum number of results to return', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number = 10;
}
