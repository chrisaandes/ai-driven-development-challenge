import { Transaction } from '../entities/transaction.entity';

/**
 * Port for transaction persistence operations.
 *
 * Implemented by PrismaTransactionRepository in the infrastructure layer.
 * Injected into use cases via INJECTION_TOKENS.TRANSACTION_REPOSITORY.
 */
export interface ITransactionRepository {
  /**
   * Persists a transaction.
   * The transaction_id serves as the idempotency key and must be unique.
   *
   * @param transaction - The transaction entity to persist
   * @throws DuplicateTransactionError if the idempotency key already exists
   */
  save(transaction: Transaction): Promise<void>;

  /**
   * Finds all transactions for a user, ordered by creation time descending.
   *
   * @param userId - The user's UUID
   * @returns Array of transactions (newest first)
   */
  findByUserId(userId: string): Promise<Transaction[]>;

  /**
   * Finds a transaction by its idempotency key (transaction_id from API).
   * Used for idempotency checking before processing a new transaction.
   *
   * @param transactionId - The client-provided transaction ID
   * @returns The transaction if found, null otherwise
   */
  findByIdempotencyKey(transactionId: string): Promise<Transaction | null>;

  /**
   * Counts transactions for a user within a time window.
   * Used by fraud detection for velocity checks.
   *
   * @param userId - The user's UUID
   * @param windowStart - The start of the time window
   * @returns The number of transactions in the window
   */
  countByUserIdInWindow(userId: string, windowStart: Date): Promise<number>;
}
