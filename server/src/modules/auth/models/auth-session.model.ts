import { IOAuthUser } from '../interfaces';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: IOAuthUser;
}
