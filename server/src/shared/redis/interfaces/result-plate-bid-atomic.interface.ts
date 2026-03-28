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
 * Represents a failed operation with no payload.
 */
export interface ResultPlateBidAtomicFailure {
  success: false;
}
