export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Time-to-live (TTL) for the socket → auction mapping key.
 * This prevents Redis from being cluttered with stale data in the event of a server crash
 * (ensuring cleanup even if the disconnect event is never triggered).
 */
export const SOCKET_AUCTION_TTL = 86400; // 24h
