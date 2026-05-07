import { Environment } from './environment.interface';

const REQUIRED_KEYS: (keyof Environment)[] = ['apiUrl', 'wsUrl', 'appName', 'storageKeyPrefix'];

/**
 * Validates the environment configuration at application startup (fail-fast).
 *
 * In production mode it additionally guards against accidental localhost URLs
 * that should never reach a production build.
 *
 * Call this function at the very top of `main.ts`, before `bootstrapApplication`.
 *
 * @throws {Error} when a required key is missing or a localhost URL slips into production.
 */
export function validateEnvironment(env: Environment): void {
  for (const key of REQUIRED_KEYS) {
    const value = env[key];

    // wsUrl is intentionally empty when sameOriginWs is true — skip the
    // missing-value check in that case so the intent is explicit in code,
    // not buried in a comment inside the validator.
    if (key === 'wsUrl' && env.sameOriginWs) continue;

    if (value === undefined || value === null || value === '')
      throw new Error(`[Environment] Missing required configuration key: "${key}"`);
  }

  // Enforce consistency: sameOriginWs=true must have an empty wsUrl and vice-versa.
  if (env.sameOriginWs && env.wsUrl !== '')
    throw new Error(
      '[Environment] Conflicting configuration: ' +
        '`sameOriginWs` is true but `wsUrl` is non-empty. ' +
        'Set `wsUrl` to an empty string or set `sameOriginWs` to false.',
    );

  if (!env.sameOriginWs && env.wsUrl === '')
    throw new Error(
      '[Environment] Conflicting configuration: ' +
        '`sameOriginWs` is false but `wsUrl` is empty. ' +
        'Provide an absolute WebSocket URL or set `sameOriginWs` to true.',
    );

  if (env.production) {
    const localhostFields = (['apiUrl', 'wsUrl'] as const).filter((key) =>
      env[key].includes('localhost'),
    );

    if (localhostFields.length > 0)
      throw new Error(
        `[Environment] Production build contains localhost URLs in: ${localhostFields.join(', ')}. ` +
          `Check src/environments/environment.prod.ts.`,
      );
  }
}
