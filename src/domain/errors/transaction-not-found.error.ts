import { DomainError } from './domain-error';

/**
 * Error when a transaction cannot be found by its ID.
 */
export class TransactionNotFoundError extends DomainError {
  readonly code = 'TRANSACTION_NOT_FOUND';

  /** The transaction ID that was not found. */
  readonly transactionId: string;

  constructor(transactionId: string) {
    super(`Transaction not found: ${transactionId}`);
    this.transactionId = transactionId;
  }
}
