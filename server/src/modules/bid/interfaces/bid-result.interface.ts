export interface IBidResult {
  success: boolean;
  reason?: string;
  code?: string;
  currentPrice?: number;
  minNextBid?: number;
}
