import { ApiProperty } from '@nestjs/swagger';
import { User } from '@modules/users';

export class AuthLoginResponse {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Authenticated user data',
    type: () => User,
  })
  user: User;
}
