export const BID_SOCKET_EVENTS = {
  // Client -> Server
  JOIN_AUCTION: 'join:auction',
  LEAVE_AUCTION: 'leave:auction',
  REJOIN_AUCTION: 'rejoin:auction',
  PLACE_BID: 'place:bid',
  REQUEST_CURRENT_STATE: 'request:current:state',

  // Server -> Client
  JOINED_AUCTION: 'joined:auction',
  LEFT_AUCTION: 'left:auction',
  REJOINED_AUCTION: 'rejoined:auction',
  CURRENT_STATE: 'current:state',
  NEW_HIGHEST_BID: 'new:highest:bid',
  BID_REJECTED: 'bid:rejected',
  PRESENCE_UPDATE: 'presence:update',
  AUCTION_ENDED: 'auction:ended',
  AUCTION_WON: 'auction:won',
  AUCTION_OUTBID: 'auction:outbid',
  EXCEPTION: 'exception',
} as const;

export const BidSocketEvent = BID_SOCKET_EVENTS;

export type BidSocketEvent = (typeof BID_SOCKET_EVENTS)[keyof typeof BID_SOCKET_EVENTS];
