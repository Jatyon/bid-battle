import { IAuthJwt } from '@modules/auth';

export const createJwtPayload = (overrides?: Partial<IAuthJwt>): IAuthJwt => ({
  sub: 1,
  email: 'test@example.com',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...overrides,
});
