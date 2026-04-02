import { SocialProviderEnum } from '../enums';
import { User } from './user.entity';
import { Entity, Column, ManyToOne, JoinColumn, Unique, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('social_accounts')
@Unique(['provider', 'providerId'])
export class SocialAccount {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({
    name: 'provider',
    type: 'enum',
    enum: SocialProviderEnum,
  })
  provider: string;

  @Index()
  @Column({ name: 'provider_id' })
  providerId: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.socialAccounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
