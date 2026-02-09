import { BaseEntity } from '../../../core/entities/base.entity';
import { UserTokenEnum } from '../enums/user-token-type.enum';
import { User } from './user.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity({ name: 'user_tokens' })
export class UserToken extends BaseEntity {
  @Column({ name: 'token' })
  @Index()
  token: string;

  @Column({
    name: 'type',
    type: 'enum',
    enum: UserTokenEnum,
  })
  type: UserTokenEnum;

  @ManyToOne(() => User, (user) => user.tokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  @Index()
  userId: number;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'is_used', default: false })
  isUsed: boolean;

  @Column({ name: 'used_at', type: 'timestamp', nullable: true })
  usedAt?: Date | null;
}
