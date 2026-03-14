import { ApiProperty } from '@nestjs/swagger';

/**
 * Represents response with pagination result
 */
export class PaginatorResponse<T = any> {
  @ApiProperty({ description: 'Items list' })
  items: T[];

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of items' })
  total: number;
}
