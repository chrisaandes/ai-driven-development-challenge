import { DomainError } from './domain-error';

/**
 * Error when a transaction with the same idempotency key already exists.
 * This is used as a safety net at the infrastructure level if the
 * unique constraint is violated after the application-level check passes.
 */
export class DuplicateTransactionError extends DomainError {
  readonly code = 'DUPLICATE_TRANSACTION';

  /** The transaction ID (idempotency key) that already exists. */
  readonly transactionId: string;

  constructor(transactionId: string) {
    super(`Duplicate transaction: ${transactionId}`);
    this.transactionId = transactionId;
  }
}
