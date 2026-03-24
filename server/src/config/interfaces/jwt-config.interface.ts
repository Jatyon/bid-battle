export interface IConfigJWT {
  tokenLife: string;
  refreshTokenLife: string;
  secret: string;
  refreshSecret: string;
  saltOrRounds: number;
}
