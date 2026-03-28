import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Email verification token received in the confirmation email',
    example: 'a3f9c1e2b7d4...',
  })
  @IsNotEmpty({ message: 'error.validation.token_not_empty' })
  @IsString({ message: 'error.validation.token_is_string' })
  token: string;
}
