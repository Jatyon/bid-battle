import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationEmailDto {
  @ApiProperty({
    description: 'Email address to resend the verification link to',
    example: 'john.doe@example.com',
    format: 'email',
  })
  @IsNotEmpty({ message: 'error.validation.email_not_empty' })
  @IsEmail({}, { message: 'error.validation.email_must_be_email' })
  email: string;
}
