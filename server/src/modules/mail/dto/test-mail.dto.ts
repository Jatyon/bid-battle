import { IsEmail, IsOptional } from 'class-validator';

export class TestMailDto {
  @IsEmail()
  email: string;

  @IsOptional()
  lang?: string;
}
