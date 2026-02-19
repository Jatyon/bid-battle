import { IAuthJwtPayload } from './auth-jwt-payload.interface';

export interface IAuthJwt {
  payload: IAuthJwtPayload;
  iat: number;
  exp: number;
}
