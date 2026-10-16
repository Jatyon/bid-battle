export function formatDateTime(
  dateValue?: string | Date | null,
  locale = 'pl',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  if (!dateValue) return '';
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;

  if (isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(locale, options).format(date);
}

export const formatActivityDate = formatDateTime;

export interface TimeRemainingCountdown {
  days: number;
  daysFormatted: string;
  hours: string;
  minutes: string;
  seconds: string;
}

/**
 * Calculates remaining time between now and a target date, returning formatted countdown units or null if expired.
 */
export function calcTimeRemaining(
  targetDate: string | Date | number,
  now: number = Date.now(),
): TimeRemainingCountdown | null {
  const targetMs =
    typeof targetDate === 'number'
      ? targetDate
      : typeof targetDate === 'string'
        ? Date.parse(targetDate)
        : targetDate.getTime();

  const diff = targetMs - now;
  if (isNaN(diff) || diff <= 0) return null;

  const totalSec = Math.floor(diff / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  return {
    days: Math.floor(totalSec / 86400),
    daysFormatted: pad(Math.floor(totalSec / 86400)),
    hours: pad(Math.floor((totalSec % 86400) / 3600)),
    minutes: pad(Math.floor((totalSec % 3600) / 60)),
    seconds: pad(totalSec % 60),
  };
}
