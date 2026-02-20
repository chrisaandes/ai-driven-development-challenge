/**
 * Input for the ProcessTransaction use case.
 * The transactionId is the client-provided idempotency key.
 */
export class ProcessTransactionInput {
  /** Client-provided transaction ID used as idempotency key. Must be unique per transaction. */
  transactionId: string;

  /** UUID of the user performing the transaction. */
  userId: string;

  /** Positive monetary amount for the transaction. */
  amount: number;

  /** Whether to add (DEPOSIT) or subtract (WITHDRAW) funds. */
  type: 'DEPOSIT' | 'WITHDRAW';

  /** Client-provided timestamp for the transaction. */
  timestamp: Date;
}

/**
 * Output from the ProcessTransaction use case.
 */
export class ProcessTransactionOutput {
  /** The transaction ID (matches the input idempotency key). */
  transactionId: string;

  /** The transaction type that was applied. */
  type: string;

  /** The monetary amount that was processed. */
  amount: number;

  /** The wallet balance after this transaction was applied. */
  balanceAfter: number;

  /** When the transaction was created. */
  timestamp: Date;

  /**
   * True if this was a newly created transaction.
   * False if the same transactionId was seen before (idempotent replay).
   */
  isNew: boolean;
}
