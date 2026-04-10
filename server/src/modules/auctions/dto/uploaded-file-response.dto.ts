import { ApiProperty } from '@nestjs/swagger';
import { IUploadedFile } from '@shared/file-upload';

export class UploadedFileDto {
  @ApiProperty({ description: 'URL of the uploaded image', example: '2026/04/auctions/2fc0d381e40e96f4.jpg' })
  url: string;

  constructor(file: IUploadedFile) {
    this.url = file.url;
  }
}
