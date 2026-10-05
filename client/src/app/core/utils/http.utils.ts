/**
 * Cleans query parameters by removing `undefined`, `null`, and empty string (`''`) values.
 * Returns an object with values suitable for `HttpParams`.
 */
export function cleanParams(
  raw?: Record<string, unknown> | null,
): Record<string, string | number | boolean> {
  if (!raw) {
    return {};
  }

  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined && value !== null && value !== '') {
      clean[key] = value as string | number | boolean;
    }
  }

  return clean;
}

/**
 * Normalizes pagination and filter parameters when an API method accepts either a page number or a filters object.
 */
export function normalizePageParams<T extends object>(
  params?: T | number,
  limit = 10,
): Record<string, unknown> {
  return typeof params === 'number'
    ? { page: params, limit }
    : { page: 1, limit, ...params };
}
