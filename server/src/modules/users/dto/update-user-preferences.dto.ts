import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserPreferencesDto {
  @ApiProperty({
    description: 'Whether to notify user when someone outbids them',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'error.validation.notify_on_outbid_must_be_boolean' })
  notifyOnOutbid?: boolean;

  @ApiProperty({
    description: 'Whether to notify user when auction they participated in ends',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'error.validation.notify_on_auction_end_must_be_boolean' })
  notifyOnAuctionEnd?: boolean;
}
