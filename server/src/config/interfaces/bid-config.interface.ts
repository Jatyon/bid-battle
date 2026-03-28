export interface IConfigBid {
  /**
   * Minimum bid increment expressed as a percentage of the current price (e.g. 1 = 1%).
   * The computed increment is always rounded up to the nearest integer and clamped
   * to at least `minIncrementAbsolute` to prevent sub-1 increments on very low-price auctions.
   */
  minIncrementPercent: number;

  /**
   * Absolute lower bound for the computed increment (in the smallest currency unit, e.g. grosz / cent).
   * Ensures that even on auctions with a very low current price the increment is never trivially small.
   */
  minIncrementAbsolute: number;
}
