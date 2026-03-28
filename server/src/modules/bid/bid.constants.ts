/**
 * Calculates the minimum required bid increment for a given current price.
 *
 * The increment is percentage-based to scale sensibly across all price ranges:
 *   - Low-price auctions (e.g. 10 PLN):  1% → 1 PLN  (clamped to absolute floor)
 *   - Mid-price auctions (e.g. 500 PLN): 1% → 5 PLN
 *   - High-price auctions (e.g. 100 000 PLN): 1% → 1 000 PLN
 *
 * The result is always a positive integer (ceil) and at least `minAbsolute`,
 * preventing trivially small increments on very low starting prices.
 *
 * @param currentPrice   - The current highest bid (or starting price if no bids yet). Must be ≥ 0.
 * @param percent        - The increment as a percentage of `currentPrice` (e.g. 1 = 1%).
 * @param minAbsolute    - Hard lower bound for the computed increment (smallest currency unit).
 * @returns              A positive integer representing the minimum bid increment.
 */
export function calcMinIncrement(currentPrice: number, percent: number, minAbsolute: number): number {
  if (currentPrice <= 0) return minAbsolute;

  const computed = Math.ceil((currentPrice * percent) / 100);
  return Math.max(computed, minAbsolute);
}
