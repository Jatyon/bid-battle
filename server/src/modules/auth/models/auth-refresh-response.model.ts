import { ApiProperty } from '@nestjs/swagger';

export class AuthRefreshResponse {
  @ApiProperty({
    description: 'Nowy JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;
}
