import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString({ message: 'validation.token_is_string' })
  @IsNotEmpty({ message: 'validation.token_not_empty' })
  refreshToken: string;
}
