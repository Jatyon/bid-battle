import { ApiProperty } from '@nestjs/swagger';
import { Match } from '@core/decorators/validator/match.decorator';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class AuthChangePasswordDto {
  @ApiProperty({
    description: 'Current user password (optional for some cases)',
    example: 'OldPassword123!',
    required: false,
  })
  @IsString()
  @IsNotEmpty({ message: 'error.validation.currentPassword_required' })
  currentPassword: string;

  @ApiProperty({
    description: 'New password (min 8 chars, at least 1 uppercase, 1 lowercase, 1 number or special char)',
    example: 'NewPassword123!',
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
    example: 'NewPassword123!',
  })
  @Match('password', { message: 'error.validation.passwords_do_not_match' })
  passwordRepeat: string;
}
