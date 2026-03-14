import { ApiProperty } from '@nestjs/swagger';

export class UploadAuctionImagesDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Images to upload for auction',
    maxItems: 10,
  })
  images: any[];
}
