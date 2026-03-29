import { ApiProperty } from '@nestjs/swagger';
import { Language } from '@core/enums/language.enum';
import { User } from './user.entity';
import { Entity, Column, OneToOne, JoinColumn, PrimaryColumn, UpdateDateColumn, CreateDateColumn } from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity({ name: 'user_preferences' })
export class UserPreferences {
  @ApiProperty({
    description: 'User ID (foreign key and primary key)',
    example: 1,
  })
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  @ApiProperty({
    description: 'Preferred language for user interface and notifications',
    example: Language.EN,
    enum: Language,
    default: Language.EN,
  })
  @Column({
    name: 'lang',
    type: 'enum',
    enum: Language,
    default: Language.EN,
  })
  lang: Language;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  @Exclude()
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  @Exclude()
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.preferences, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
