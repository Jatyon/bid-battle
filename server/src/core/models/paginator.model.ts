import { ApiProperty } from '@nestjs/swagger';
import { PaginatorResponse } from './paginator-response.model';
import { IsOptional, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Represents received pagination data. Also allows to create pagination response result;
 */
export class Paginator {
  @ApiProperty({
    description: 'Page number (starting from 1)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'error.validation.page_must_be_integer' })
  @Min(1, { message: 'error.validation.page_must_be_at_least_1' })
  page: number;

  @ApiProperty({
    description: 'Items per page (allowed values: 10, 20, 50)',
    example: 10,
    required: false,
    enum: [10, 20, 50],
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'error.validation.limit_must_be_integer' })
  @IsIn([10, 20, 50], { message: 'error.validation.limit_must_be_allowed_value' })
  limit: number = 10;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  /**
   * Creates pagination response result
   * @param items Items on page
   * @param page Current page number
   * @param limit Number of items on page
   * @param total Total number of items
   */
  response<T>(items: T[], page: number, limit: number, total?: number): PaginatorResponse<T> {
    const response: PaginatorResponse<T> = new PaginatorResponse();
    response.items = items;
    response.page = page;
    response.limit = limit;
    response.total = total ?? items.length;

    return response;
  }
}
