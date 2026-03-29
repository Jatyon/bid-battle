import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ description: 'User first name', example: 'John', required: false })
  @IsString({ message: 'error.validation.first_name_is_string' })
  @IsNotEmpty({ message: 'error.validation.first_name_not_empty' })
  @MaxLength(255, { message: 'error.validation.first_name_too_long' })
  @IsOptional()
  firstName?: string;

  @ApiProperty({ description: 'User last name', example: 'Doe', required: false })
  @IsString({ message: 'error.validation.last_name_is_string' })
  @IsNotEmpty({ message: 'error.validation.last_name_not_empty' })
  @MaxLength(255, { message: 'error.validation.last_name_too_long' })
  @IsOptional()
  lastName?: string;
}
