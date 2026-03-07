import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({
    example: 'UP',
    description: 'Server status',
  })
  status: string;
}
