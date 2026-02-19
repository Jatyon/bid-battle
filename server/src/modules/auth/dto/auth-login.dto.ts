import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class AuthLoginDto {
  @IsEmail({}, { message: 'error.validation.email_must_be_email' })
  @IsNotEmpty({ message: 'error.validation.email_not_empty' })
  email: string;

  @IsString({ message: 'error.validation.password_not_empty' })
  @MinLength(8, { message: 'error.validation.password_at_least_8_characters' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'error.validation.password_too_weak',
  })
  password: string;
}
