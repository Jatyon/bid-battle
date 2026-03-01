import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'error.validation.email_must_be_email' })
  email: string;
}
