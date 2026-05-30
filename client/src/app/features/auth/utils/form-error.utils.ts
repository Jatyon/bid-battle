import { HttpErrorResponse } from '@angular/common/http';

/**
 * Extracts a human-readable error message from an HTTP error response.
 * Handles both `string` and `string[]` message formats returned by the API.
 *
 * Use this in form `onSubmit` error callbacks to populate inline field errors
 * via `control.setErrors({ serverError: resolveHttpError(err) })`.
 *
 * @example
 * error: (err: HttpErrorResponse) => {
 *   this.form.controls.email.setErrors({ serverError: resolveHttpError(err) });
 * }
 */
export function resolveHttpError(err: HttpErrorResponse): string {
  const body = err.error as { message?: string | string[] } | null;
  if (!body?.message) return err.message;
  return Array.isArray(body.message) ? body.message[0] : body.message;
}
