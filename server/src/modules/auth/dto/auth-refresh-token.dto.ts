import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString({ message: 'error.validation.token_is_string' })
  @IsNotEmpty({ message: 'error.validation.token_not_empty' })
  refreshToken: string;
}
