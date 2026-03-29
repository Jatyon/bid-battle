import { ApiProperty } from '@nestjs/swagger';
import { Language } from '@core/enums/language.enum';
import { IsBoolean, IsEnum } from 'class-validator';

export class UpdateUserPreferencesDto {
  @ApiProperty({
    description: 'Preferred language for user interface and notifications',
    example: Language.EN,
    enum: Language,
    default: Language.EN,
  })
  @IsEnum(Language, { message: 'error.validation.lang_must_be_allowed_value' })
  lang: Language;

  @ApiProperty({
    description: 'Whether to notify user when someone outbids them',
    example: true,
    required: false,
  })
  @IsBoolean({ message: 'error.validation.notify_on_outbid_must_be_boolean' })
  notifyOnOutbid: boolean;

  @ApiProperty({
    description: 'Whether to notify user when auction they participated in ends',
    example: true,
    required: false,
  })
  @IsBoolean({ message: 'error.validation.notify_on_auction_end_must_be_boolean' })
  notifyOnAuctionEnd: boolean;
}
