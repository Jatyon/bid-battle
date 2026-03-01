import { IAuthJwtPayload } from './auth-jwt-payload.interface';

export interface IAuthJwt extends IAuthJwtPayload {
  iat: number;
  exp: number;
}
