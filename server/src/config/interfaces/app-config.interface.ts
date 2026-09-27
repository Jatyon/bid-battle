export interface IConfigApp {
  mode: string;
  name: string;
  host: string;
  publicUrl: string;
  frontendHost: string;
  port: number;
  timeoutMs: number;
  throttleTtlMs: number;
  throttleLimit: number;
  authThrottleTtlMs: number;
  authThrottleLimit: number;
  corsOrigin: string;
  emailVerificationExpiresInMin: number;
  resetPasswordExpiresInMin: number;
}
