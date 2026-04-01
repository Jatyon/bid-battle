import { BidRejectionCode } from '../enums';

/**
 * A discriminated union representing the outcome of an operation.
 * Narrows to {@link ResultSuccess} or {@link ResultFailure} via the `success` field.
 */
export type ResultPlateBidAtomic<T> = ResultPlateBidAtomicSuccess<T> | ResultPlateBidAtomicFailure;

/**
 * Represents a successful operation with an attached data payload.
 */
export interface ResultPlateBidAtomicSuccess<T> {
  success: true;
  data: T;
}

/**
 * Represents a failed operation.
 *
 * `rejectionCode` mirrors the numeric code returned by the Lua BID_SCRIPT:
 *  - `2` — auction is no longer active
 *  - `3` — user is already the highest bidder (ALREADY_LEADING)
 *  - `4` — bid amount is below the required minimum increment
 *
 * The field is absent when the failure originates from a caught Redis/Lua exception
 * rather than a business-rule rejection.
 */
export interface ResultPlateBidAtomicFailure {
  success: false;
  rejectionCode?: BidRejectionCode;
}
