/**
 * Converts a monetary amount from a main currency unit (e.g., PLN, USD, EUR) to its smallest unit (cents/grosze).
 * Example: 10.50 -> 1050, "12.34" -> 1234
 */
export function toCents(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  const parsed = typeof amount === 'number' ? amount : Number(amount);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/**
 * Converts an amount from smallest currency unit (cents/grosze) to main currency unit (e.g., PLN, USD, EUR).
 * Example: 1050 -> 10.5
 */
export function centsToUnits(cents: number | null | undefined): number {
  if (cents === null || cents === undefined || isNaN(cents)) return 0;
  return cents / 100;
}

export interface BidIncrementTier {
  threshold: number;
  increment: number;
}

export const BID_INCREMENT_TIERS: readonly BidIncrementTier[] = [
  { threshold: 5000, increment: 100 },
  { threshold: 10000, increment: 200 },
  { threshold: 50000, increment: 500 },
  { threshold: 100000, increment: 1000 },
  { threshold: 500000, increment: 2500 },
] as const;

export const DEFAULT_MAX_BID_INCREMENT = 5000;

/**
 * Calculates the minimum required bid increment for a given current price (in minor currency units, e.g. cents).
 * Matches the backend bid increment tiers:
 * - < 50.00 (5 000 minor units) -> 1.00 (100 minor units)
 * - < 100.00 (10 000 minor units) -> 2.00 (200 minor units)
 * - < 500.00 (50 000 minor units) -> 5.00 (500 minor units)
 * - < 1000.00 (100 000 minor units) -> 10.00 (1 000 minor units)
 * - < 5000.00 (500 000 minor units) -> 25.00 (2 500 minor units)
 * - >= 5000.00 -> 50.00 (5 000 minor units)
 */
export function calcMinIncrement(currentPrice: number): number {
  for (const tier of BID_INCREMENT_TIERS) {
    if (currentPrice < tier.threshold) return tier.increment;
  }
  return DEFAULT_MAX_BID_INCREMENT;
}
