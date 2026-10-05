import { centsToUnits, toCents } from './price.utils';

describe('price.utils', () => {
  describe('toCents', () => {
    it('should convert numeric main currency unit to cents', () => {
      expect(toCents(10.5)).toBe(1050);
      expect(toCents(100)).toBe(10000);
      expect(toCents(0.01)).toBe(1);
    });

    it('should convert string main currency unit to cents', () => {
      expect(toCents('12.34')).toBe(1234);
      expect(toCents('10')).toBe(1000);
    });

    it('should handle invalid or empty inputs gracefully', () => {
      expect(toCents(null)).toBe(0);
      expect(toCents(undefined)).toBe(0);
      expect(toCents('')).toBe(0);
      expect(toCents('invalid')).toBe(0);
    });
  });

  describe('centsToUnits', () => {
    it('should convert cents to main currency units (e.g. PLN/USD/EUR)', () => {
      expect(centsToUnits(1050)).toBe(10.5);
      expect(centsToUnits(10000)).toBe(100);
      expect(centsToUnits(1)).toBe(0.01);
    });

    it('should handle null/undefined/NaN gracefully', () => {
      expect(centsToUnits(null)).toBe(0);
      expect(centsToUnits(undefined)).toBe(0);
      expect(centsToUnits(NaN)).toBe(0);
    });
  });
});
