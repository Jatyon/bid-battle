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
