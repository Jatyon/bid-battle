import { Match } from '@core/decorators/validator/match.decorator';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class AuthChangePasswordDto {
  @IsOptional()
  @IsString({ message: 'error.validation.currentPassword_is_string' })
  currentPassword?: string;

  @IsString({ message: 'error.validation.password_not_empty' })
  @MinLength(8, { message: 'error.validation.password_at_least_8_characters' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'error.validation.password_too_weak',
  })
  password: string;

  @Match('password', { message: 'error.validation.passwords_do_not_match' })
  passwordRepeat: string;
}
