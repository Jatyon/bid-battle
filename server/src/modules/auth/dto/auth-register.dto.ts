import { Match } from '@core/decorators/validator/match.decorator';
import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthRegisterDto {
  @ApiProperty({
    description: 'User first name',
    example: 'John',
    minLength: 1,
  })
  @IsString({ message: 'error.validation.first_name_is_string' })
  @IsNotEmpty({ message: 'error.validation.first_name_not_empty' })
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    minLength: 1,
  })
  @IsString({ message: 'error.validation.last_name_is_string' })
  @IsNotEmpty({ message: 'error.validation.last_name_not_empty' })
  lastName: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'error.validation.email_must_be_email' })
  @IsNotEmpty({ message: 'error.validation.email_not_empty' })
  email: string;

  @ApiProperty({
    description: 'User password (min 8 chars, at least 1 uppercase, 1 lowercase, 1 number or special char)',
    example: 'Password123!',
    minLength: 8,
    pattern: '/((?=.*\\d)|(?=.*\\W+))(?![.\\n])(?=.*[A-Z])(?=.*[a-z]).*$/',
  })
  @IsString({ message: 'error.validation.password_not_empty' })
  @MinLength(8, { message: 'error.validation.password_at_least_8_characters' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'error.validation.password_too_weak',
  })
  password: string;

  @ApiProperty({
    description: 'Password confirmation (must match password)',
    example: 'Password123!',
  })
  @Match('password', { message: 'error.validation.passwords_do_not_match' })
  passwordRepeat: string;
}
