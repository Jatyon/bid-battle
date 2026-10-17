export interface AuctionBidder {
  id: number;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

export interface AuctionBidItem {
  id: number;
  amount: number;
  createdAt: string;
  user?: AuctionBidder | null;
  isMyBid?: boolean;
}

export interface NewHighestBidEvent {
  auctionId: number;
  amount: number;
  timestamp: string;
  bid?: AuctionBidItem;
}

export interface BidRejectedEvent {
  reason: string;
  code: string;
  currentPrice?: number;
  minNextBid?: number;
}

export interface PresenceUpdateEvent {
  auctionId: number;
  participantsCount: number;
  timestamp: string;
}

export interface AuctionEndedEvent {
  auctionId: number;
  finalPrice?: number;
  timestamp: string;
}

export interface CurrentStateEvent {
  auctionId: number;
  currentPrice: number;
  isLeading: boolean;
  isActive: boolean;
  participantsCount: number;
  timestamp: string;
}

export interface AuctionEvent {
  auctionId: number;
  timestamp: string;
}

export interface AuctionOutbidEvent {
  auctionId: number;
  newAmount: number;
  auctionTitle?: string;
  timestamp: string;
}
