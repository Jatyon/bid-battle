/**
 * Calculates the minimum required bid increment for a given current price.
 * The system uses predefined tiers based on the current price (prices are in grosze):
 * - 0.00 - 49.99 PLN -> 1.00 PLN
 * - 50.00 - 99.99 PLN -> 2.00 PLN
 * - 100.00 - 499.99 PLN -> 5.00 PLN
 * - 500.00 - 999.99 PLN -> 10.00 PLN
 * - 1000.00 - 4999.99 PLN -> 25.00 PLN
 * - >= 5000.00 PLN -> 50.00 PLN
 *
 * @param currentPrice - The current highest bid (or starting price if no bids yet) in grosze. Must be >= 0.
 * @returns A positive integer representing the minimum bid increment in grosze.
 */
export function calcMinIncrement(currentPrice: number): number {
  if (currentPrice < 5000) return 100; // < 50 PLN -> 1 PLN
  if (currentPrice < 10000) return 200; // < 100 PLN -> 2 PLN
  if (currentPrice < 50000) return 500; // < 500 PLN -> 5 PLN
  if (currentPrice < 100000) return 1000; // < 1000 PLN -> 10 PLN
  if (currentPrice < 500000) return 2500; // < 5000 PLN -> 25 PLN

  return 5000; // >= 5000 PLN -> 50 PLN
}
