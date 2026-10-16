import { calcMinIncrement, centsToUnits, toCents } from './price.utils';

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

  describe('calcMinIncrement', () => {
    it('should return 100 (1.00 unit) for price under 5000 (50.00 units)', () => {
      expect(calcMinIncrement(0)).toBe(100);
      expect(calcMinIncrement(4999)).toBe(100);
    });

    it('should return 200 (2.00 units) for price between 5000 and 9999', () => {
      expect(calcMinIncrement(5000)).toBe(200);
      expect(calcMinIncrement(9999)).toBe(200);
    });

    it('should return 500 (5.00 units) for price between 10000 and 49999', () => {
      expect(calcMinIncrement(10000)).toBe(500);
      expect(calcMinIncrement(49999)).toBe(500);
    });

    it('should return 1000 (10.00 units) for price between 50000 and 99999', () => {
      expect(calcMinIncrement(50000)).toBe(1000);
      expect(calcMinIncrement(99999)).toBe(1000);
    });

    it('should return 2500 (25.00 units) for price between 100000 and 499999', () => {
      expect(calcMinIncrement(100000)).toBe(2500);
      expect(calcMinIncrement(499999)).toBe(2500);
    });

    it('should return 5000 (50.00 units) for price 500000 and above', () => {
      expect(calcMinIncrement(500000)).toBe(5000);
      expect(calcMinIncrement(1000000)).toBe(5000);
    });
  });
});
