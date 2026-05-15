import { User } from '@modules/users';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}
