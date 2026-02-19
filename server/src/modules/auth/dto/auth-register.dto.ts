import { Match } from '@core/decorators/validator/match.decorator';
import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class AuthRegisterDto {
  @IsString({ message: 'error.validation.first_name_is_string' })
  @IsNotEmpty({ message: 'error.validation.first_name_not_empty' })
  firstName: string;

  @IsString({ message: 'error.validation.last_name_is_string' })
  @IsNotEmpty({ message: 'error.validation.last_name_not_empty' })
  lastName: string;

  @IsEmail({}, { message: 'error.validation.email_must_be_email' })
  @IsNotEmpty({ message: 'error.validation.email_not_empty' })
  email: string;

  @IsString({ message: 'error.validation.password_not_empty' })
  @MinLength(8, { message: 'error.validation.password_at_least_8_characters' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'error.validation.password_too_weak',
  })
  password: string;

  @Match('password', { message: 'error.validation.passwords_do_not_match' })
  passwordRepeat: string;
}
