import { Entity, Column, OneToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';

@Entity({ name: 'user_preferences' })
export class UserPreferences {
  @ApiProperty({
    description: 'User ID (foreign key and primary key)',
    example: 1,
  })
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  @ApiProperty({
    description: 'Whether to notify user when someone outbids them',
    example: true,
    default: true,
  })
  @Column({ name: 'notify_on_outbid', type: 'boolean', default: true })
  notifyOnOutbid: boolean;

  @ApiProperty({
    description: 'Whether to notify user when auction they participated in ends',
    example: true,
    default: true,
  })
  @Column({ name: 'notify_on_auction_end', type: 'boolean', default: true })
  notifyOnAuctionEnd: boolean;

  @OneToOne(() => User, (user) => user.preferences, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
