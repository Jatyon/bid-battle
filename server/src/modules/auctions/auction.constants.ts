export const AUCTION_END_QUEUE = 'auction-end';
export const AUCTION_START_QUEUE = 'auction-start';

export const AUCTION_MAX_DURATION_HOURS = 720;

/**
 * Prices in this system are stored as **whole integers** representing the smallest
 * currency unit (e.g. Polish grosz: 1 PLN = 100).
 * Using integers avoids floating-point rounding errors in bid comparisons and
 * matches the database schema (`bigint unsigned` in MySQL).
 *
 * Allowed range: 1 .. 999_999_999
 */
export const AUCTION_PRICE_MAX = 999_999_999;
