export interface BidAtomicSnapshot {
  /** The highest price before this bid was applied, or null if no bids existed. */
  previousPrice: number | null;
  /** The ID of the previous highest bidder, or null if no bids existed. */
  previousBidderId: number | null;
}
