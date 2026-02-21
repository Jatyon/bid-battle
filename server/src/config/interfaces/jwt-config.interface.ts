export interface IConfigJWT {
  tokenLife: number;
  refreshTokenLife: number;
  secret: string;
  saltOrRounds: number;
}
