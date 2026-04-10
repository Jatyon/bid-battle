import { ApiProperty } from '@nestjs/swagger';
import { User } from '../entities/user.entity';

export class PublicUserProfileResponse {
  @ApiProperty({ description: 'User ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'User first name', example: 'John' })
  firstName: string;

  @ApiProperty({ description: 'Initial of the last name', example: 'D.' })
  lastNameInitial: string;

  @ApiProperty({ description: 'User avatar URL or path', example: '2026/04/avatars/he90edae42366994.jpg', nullable: true })
  avatar: string | null;

  @ApiProperty({ description: 'Date when user joined the platform', example: '2026-01-01T00:00:00.000Z' })
  joinedAt: Date;

  constructor(user: User) {
    this.id = user.id;
    this.firstName = user.firstName;
    this.lastNameInitial = user.lastName ? `${user.lastName.charAt(0)}.` : '';
    this.avatar = user.avatar ? user.avatar : null;
    this.joinedAt = user.createdAt;
  }
}
