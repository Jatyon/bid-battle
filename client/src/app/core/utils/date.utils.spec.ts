import { calcTimeRemaining, formatDateTime } from './date.utils';

describe('date.utils', () => {
  describe('formatDateTime', () => {
    it('should return empty string for null, undefined or empty input', () => {
      expect(formatDateTime(null)).toBe('');
      expect(formatDateTime(undefined)).toBe('');
    });

    it('should return empty string for invalid date', () => {
      expect(formatDateTime('invalid-date')).toBe('');
    });

    it('should format valid date correctly', () => {
      const date = new Date('2026-05-10T12:00:00Z');
      expect(formatDateTime(date, 'en')).toBeTruthy();
    });
  });

  describe('calcTimeRemaining', () => {
    it('should return null when target is in the past or expired', () => {
      const now = 1000000;
      expect(calcTimeRemaining(now - 1000, now)).toBeNull();
      expect(calcTimeRemaining(now, now)).toBeNull();
    });

    it('should return null for invalid target date', () => {
      expect(calcTimeRemaining('invalid-date', Date.now())).toBeNull();
    });

    it('should correctly format hours, minutes, and seconds when under 1 day', () => {
      const now = 1000000;
      // 3 hours, 5 minutes, 9 seconds
      const target = now + (3 * 3600 + 5 * 60 + 9) * 1000;

      const result = calcTimeRemaining(target, now);
      expect(result).toEqual({
        days: 0,
        daysFormatted: '00',
        hours: '03',
        minutes: '05',
        seconds: '09',
      });
    });

    it('should correctly format days when 1 day or more', () => {
      const now = 1000000;
      // 2 days, 14 hours, 22 minutes, 45 seconds
      const target = now + (2 * 86400 + 14 * 3600 + 22 * 60 + 45) * 1000;

      const result = calcTimeRemaining(target, now);
      expect(result).toEqual({
        days: 2,
        daysFormatted: '02',
        hours: '14',
        minutes: '22',
        seconds: '45',
      });
    });
  });
});
