export const MAX_IMAGES = 10;
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const MIN_END_TIME_MS = 60 * 60 * 1000;
export const MAX_END_TIME_MS = 720 * MIN_END_TIME_MS;
export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 999_999_999;
export const STEP_PRICE = 0.01;
export const TIME_PICKER_STEP_SECONDS = 15 * 60;

export function toLocalDateTime(value: Date | string): string {
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
