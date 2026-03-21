/**
 * Minimum bid increment value.
 * Any new bid must be higher than the current price by at least this amount.
 * * Business Logic:
 * Prevents "micro-bidding" (e.g., bidding +0.01 on a high-value item),
 * which can frustrate users and clutter the bid history.
 * Ensure this value is consistent with the `minIncrement` argument
 * passed to the Redis Lua script.
 */
export const MIN_BID_INCREMENT = 1;
