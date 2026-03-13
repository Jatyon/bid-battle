import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AuctionImageDto {
  @ApiProperty({ example: '/uploads/abc-123.jpg' })
  @IsString()
  url: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
