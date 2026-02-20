/**
 * Input for the GetTransactionHistory use case.
 */
export class GetTransactionHistoryInput {
  /** UUID of the user whose transaction history to retrieve. */
  userId: string;
}

/**
 * A single transaction entry in the history list.
 */
export interface TransactionHistoryItem {
  /** The transaction's unique ID. */
  transactionId: string;

  /** The transaction type string (e.g., 'DEPOSIT' or 'WITHDRAW'). */
  type: string;

  /** The monetary amount. */
  amount: number;

  /** The wallet balance after the transaction. */
  balanceAfter: number;

  /** When the transaction was created. */
  timestamp: Date;
}

/**
 * Output from the GetTransactionHistory use case.
 */
export class GetTransactionHistoryOutput {
  /** Ordered list of transactions (newest first). */
  transactions: TransactionHistoryItem[];

  /** Total number of transactions in the list. */
  total: number;
}
