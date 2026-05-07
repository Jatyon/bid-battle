import { HttpContextToken } from '@angular/common/http';

/**
 * When set to `true`, the loading interceptor will NOT increment the global
 * loading counter for this request. Useful for silent/background requests
 * (e.g. token refresh, polling) that should not trigger the loading spinner.
 */
export const SKIP_LOADING = new HttpContextToken<boolean>(() => false);

/**
 * When set to `true`, the error interceptor will NOT show a global error
 * toast for this request. The caller is responsible for its own error handling.
 */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/**
 * When set to `true`, the refresh interceptor will NOT attempt a token refresh
 * on a 401 response. Must be set on the refresh token request itself to break
 * the potential infinite refresh loop.
 */
export const SKIP_REFRESH_ON_401 = new HttpContextToken<boolean>(() => false);
