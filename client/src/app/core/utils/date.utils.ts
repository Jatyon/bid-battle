export function formatDateTime(
  dateValue?: string | Date | null,
  locale = 'pl',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
): string {
  if (!dateValue) return '';
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;

  if (isNaN(date.getTime())) return '';
  
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export const formatActivityDate = formatDateTime;
