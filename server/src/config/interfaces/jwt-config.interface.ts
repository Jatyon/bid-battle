export interface IConfigJWT {
  tokenLife: number;
  refreshTokenLife: number;
  secret: string;
  salt: string;
  saltOrRounds: number;
}
