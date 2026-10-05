import { PricePipe, formatPrice } from './price.pipe';

describe('formatPrice', () => {
  it('formats regular amounts in cents correctly to PLN', () => {
    expect(formatPrice(1005)).toBe('10.05 PLN');
    expect(formatPrice(50)).toBe('0.50 PLN');
    expect(formatPrice(100)).toBe('1.00 PLN');
    expect(formatPrice(0)).toBe('0.00 PLN');
  });

  it('formats thousands with grouping separator', () => {
    expect(formatPrice(250000)).toBe('2,500.00 PLN');
    expect(formatPrice(10000000)).toBe('100,000.00 PLN');
  });

  it('handles null, undefined and NaN gracefully', () => {
    expect(formatPrice(null)).toBe('0.00 PLN');
    expect(formatPrice(undefined)).toBe('0.00 PLN');
    expect(formatPrice(NaN)).toBe('0.00 PLN');
  });

  it('supports custom currency', () => {
    expect(formatPrice(1234, 'USD')).toBe('12.34 USD');
    expect(formatPrice(1234, 'EUR')).toBe('12.34 EUR');
  });
});

describe('PricePipe', () => {
  let pipe: PricePipe;

  beforeEach(() => {
    pipe = new PricePipe();
  });

  it('transforms value in cents using default currency PLN', () => {
    expect(pipe.transform(4999)).toBe('49.99 PLN');
  });

  it('transforms null to 0.00 PLN', () => {
    expect(pipe.transform(null)).toBe('0.00 PLN');
  });

  it('accepts custom currency and digits info', () => {
    expect(pipe.transform(5000, 'EUR')).toBe('50.00 EUR');
  });
});
