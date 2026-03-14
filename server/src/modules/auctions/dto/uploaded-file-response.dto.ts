import { ApiProperty } from '@nestjs/swagger';
import { IUploadedFile } from '@shared/file-upload';

export class UploadedFileDto {
  @ApiProperty({ description: 'URL of the uploaded image', example: '/uploads/2026/03/auctions/abc123.jpg' })
  url: string;

  constructor(file: IUploadedFile) {
    this.url = file.url;
  }
}
