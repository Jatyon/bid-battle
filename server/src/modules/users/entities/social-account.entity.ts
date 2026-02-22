import { BaseEntity } from '../../../core/entities/base.entity';
import { SocialProviderEnum } from '../enums';
import { User } from './user.entity';
import { Entity, Column, ManyToOne, JoinColumn, Unique, Index } from 'typeorm';

@Entity('social_accounts')
@Unique(['provider', 'providerId'])
export class SocialAccount extends BaseEntity {
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
  userId: string;

  @ManyToOne(() => User, (user) => user.socialAccounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
