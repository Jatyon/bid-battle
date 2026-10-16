export interface AuctionCloseResult {
  wasActive: boolean;
  finalPrice: number | null;
  winnerId: number | null;
}
