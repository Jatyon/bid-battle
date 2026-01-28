export interface IConfigApp {
  mode: string;
  name: string;
  host: string;
  frontendHost: string;
  port: number;
  timeoutMs: number;
  corsOrigin: string;
  emailVerificationExpiresInMin: number;
  resetPasswordExpiresInMin: number;
}
