import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty()
  statusCode: number;

  @ApiProperty()
  timestamp: string;

  data: T;
}
