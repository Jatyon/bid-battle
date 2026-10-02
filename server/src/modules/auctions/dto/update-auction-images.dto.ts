import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsArray, IsString, IsInt, Min } from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

export class UpdateAuctionImagesDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'New images to upload',
    required: false,
  })
  @IsOptional()
  images?: Express.Multer.File[];

  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    description: 'URLs of existing images to keep. Omit URL to delete that image.',
    required: false,
    default: [],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }: TransformFnParams) => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value !== 'string') return [];

    return value
      .split(',')
      .map((v: string) => v.trim())
      .filter(Boolean);
  })
  existingImageUrls?: string[];

  @ApiProperty({
    type: 'number',
    description: 'Index of primary image in final set (kept + new). Defaults to 0.',
    required: false,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }: TransformFnParams) => {
    if (value === undefined || value === null) return undefined;

    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? (value as number) : parsed;
  })
  primaryImageIndex?: number;
}
