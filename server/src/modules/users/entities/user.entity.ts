import { ApiProperty } from '@nestjs/swagger';
import { UserPreferences } from './user-preferences.entity';
import { SocialAccount } from './social-account.entity';
import { UserToken } from './user-token.entity';
import { Auction } from '../../auctions/entities/auction.entity';
import { Bid } from '../../bid/entities/bid.entity';
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity({ name: 'users' })
export class User {
  @ApiProperty({
    description: 'Unique identifier',
    example: 1,
  })
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @ApiProperty({ description: 'User email address', example: 'john.doe@example.com', format: 'email' })
  @Index()
  @Column({ name: 'email', type: 'varchar', length: 255, unique: true })
  email: string;

  @Exclude()
  @Column({ name: 'password', type: 'varchar', length: 255, select: false, nullable: true })
  password?: string;

  @ApiProperty({ description: 'User first name', example: 'John' })
  @Column({ name: 'first_name', type: 'varchar', length: 255 })
  firstName: string;

  @ApiProperty({ description: 'User last name', example: 'Doe' })
  @Column({ name: 'last_name', type: 'varchar', length: 255 })
  lastName: string;

  @ApiProperty({ description: 'User avatar URL', example: 'https://example.com/avatar.jpg', nullable: true })
  @Column({ name: 'avatar', type: 'varchar', length: 255, nullable: true })
  avatar?: string | null;

  @Column({ name: 'is_email_verified', type: 'boolean', default: false })
  @Exclude()
  isEmailVerified: boolean;

  @ApiProperty({ description: 'Last login timestamp', type: 'string', format: 'date-time', nullable: true })
  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Exclude()
  @Column({ name: 'password_changed_at', type: 'timestamp', nullable: true })
  passwordChangedAt?: Date | null;

  @Index()
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  @Exclude()
  deletedAt?: Date | null;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-03-07T10:00:00Z',
    type: 'string',
    format: 'date-time',
  })
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  @Exclude()
  updatedAt: Date;

  @Exclude()
  @OneToMany(() => SocialAccount, (social) => social.user, { cascade: true })
  socialAccounts: SocialAccount[];

  @Exclude()
  @OneToMany(() => UserToken, (token) => token.user)
  tokens: UserToken[];

  @OneToOne(() => UserPreferences, (preferences) => preferences.user, { cascade: true })
  preferences?: UserPreferences;

  @OneToMany(() => Auction, (auction) => auction.owner)
  auctionsOwned: Auction[];

  @OneToMany(() => Auction, (auction) => auction.winner)
  auctionsWon: Auction[];

  @OneToMany(() => Bid, (bid) => bid.user)
  bids: Bid[];

  get concatName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
