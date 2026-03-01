import { BaseEntity } from '../../../core/entities/base.entity';
import { SocialAccount } from './social-account.entity';
import { UserToken } from './user-token.entity';
import { Column, DeleteDateColumn, Entity, Index, OneToMany } from 'typeorm';

@Entity({ name: 'users' })
export class User extends BaseEntity {
  @Index()
  @Column({ name: 'email', type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'password', type: 'varchar', length: 255, select: false, nullable: true })
  password?: string;

  @Column({ name: 'first_name', type: 'varchar', length: 255 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 255 })
  lastName: string;

  @Column({ name: 'avatar', type: 'varchar', length: 255, nullable: true })
  avatar?: string | null;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Index()
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => SocialAccount, (social) => social.user, { cascade: true })
  socialAccounts: SocialAccount[];

  @OneToMany(() => UserToken, (token) => token.user)
  tokens: UserToken[];

  get concatName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
