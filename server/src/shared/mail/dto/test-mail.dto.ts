import { ApiProperty } from '@nestjs/swagger';
import { Language } from '@core/enums';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';

export class TestMailDto {
  @ApiProperty({
    description: 'Email address to send test email to',
    example: 'test@example.com',
    format: 'email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Language for email template',
    example: Language.EN,
    enum: Language,
    default: Language.EN,
    required: false,
  })
  @IsEnum(Language, { message: 'error.validation.lang_must_be_allowed_value' })
  @IsOptional()
  lang?: Language;
}
