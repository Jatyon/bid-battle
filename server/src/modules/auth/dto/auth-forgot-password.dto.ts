import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'validation.email_must_be_email' })
  email: string;
}
