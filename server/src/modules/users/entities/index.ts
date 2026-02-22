import { SocialAccount } from './social-account.entity';
import { UserToken } from './user-token.entity';
import { User } from './user.entity';

export * from './social-account.entity';
export * from './user-token.entity';
export * from './user.entity';

export const ENTITIES = [User, SocialAccount, UserToken];
