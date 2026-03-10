import { IsEmail, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
    example: 'en',
    enum: ['en', 'pl'],
    default: 'en',
    required: false,
  })
  @IsOptional()
  lang?: string;
}
