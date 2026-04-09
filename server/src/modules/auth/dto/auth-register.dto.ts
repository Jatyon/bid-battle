import { Match } from '@core/decorators/validator/match.decorator';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthRegisterDto {
  @ApiProperty({
    description: 'User first name',
    example: 'John',
    minLength: 1,
    maxLength: 255,
  })
  @IsString({ message: 'error.validation.first_name_is_string' })
  @IsNotEmpty({ message: 'error.validation.first_name_not_empty' })
  @MaxLength(255, { message: 'error.validation.first_name_too_long' })
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    minLength: 1,
    maxLength: 255,
  })
  @IsString({ message: 'error.validation.last_name_is_string' })
  @IsNotEmpty({ message: 'error.validation.last_name_not_empty' })
  @MaxLength(255, { message: 'error.validation.last_name_too_long' })
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
    description: 'User password (min 8 chars, at least 1 uppercase, 1 lowercase, 1 number and 1 special char)',
    example: 'Password123!',
    minLength: 8,
    pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[\\W_]).*$',
  })
  @IsString({ message: 'error.validation.password_not_empty' })
  @MinLength(8, { message: 'error.validation.password_at_least_8_characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/, {
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
