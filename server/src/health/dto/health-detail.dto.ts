import { ApiProperty } from '@nestjs/swagger';

export type HealthStatus = 'UP' | 'DOWN';

export class ComponentHealthDto {
  @ApiProperty({ enum: ['UP', 'DOWN'], example: 'UP' })
  status: HealthStatus;

  @ApiProperty({ required: false, example: 12 })
  responseTimeMs?: number;

  @ApiProperty({ required: false, example: 'Connection refused' })
  error?: string;
}

export class HealthDetailDto {
  @ApiProperty({ enum: ['UP', 'DOWN'], example: 'UP' })
  status: HealthStatus;

  @ApiProperty({ type: ComponentHealthDto })
  database: ComponentHealthDto;

  @ApiProperty({ type: ComponentHealthDto })
  redis: ComponentHealthDto;

  @ApiProperty({ type: ComponentHealthDto })
  bullmq: ComponentHealthDto;
}
