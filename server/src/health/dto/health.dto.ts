import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({ example: 'UP', description: 'Serwera status' })
  status: string;
}
