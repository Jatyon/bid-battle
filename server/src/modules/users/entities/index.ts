import { SocialAccount } from './social-account.entity';
import { UserToken } from './user-token.entity';
import { UserPreferences } from './user-preferences.entity';
import { User } from './user.entity';

export * from './social-account.entity';
export * from './user-token.entity';
export * from './user-preferences.entity';
export * from './user.entity';

export const ENTITIES = [User, SocialAccount, UserToken, UserPreferences];
