import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthLoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'error.validation.email_must_be_email' })
  @IsNotEmpty({ message: 'error.validation.email_not_empty' })
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'Password123!',
  })
  @IsString({ message: 'error.validation.password_not_empty' })
  @IsNotEmpty({ message: 'error.validation.password_not_empty' })
  password: string;
}
