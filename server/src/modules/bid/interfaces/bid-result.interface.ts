import { Bid } from '../../bid/entities/bid.entity';

export interface IBidResult {
  success: boolean;
  reason?: string;
  code?: string;
  currentPrice?: number;
  minNextBid?: number;
  bid?: Bid;
  previousBidderId?: number | null;
}
