import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'User email address to send password reset link',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'error.validation.email_must_be_email' })
  email: string;
}
