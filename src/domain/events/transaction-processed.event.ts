import { DomainEvent } from './domain-event';

/**
 * Event emitted when a transaction (deposit or withdrawal) has been processed.
 *
 * Published after the wallet and transaction have been persisted.
 * Consumed by:
 * - FraudCheckHandler (runs fraud analysis)
 * - AuditLogHandler (logs the transaction)
 */
export class TransactionProcessedEvent extends DomainEvent {
  /**
   * @param transactionId - The unique transaction ID
   * @param walletId - The wallet that was affected
   * @param userId - The user who performed the transaction
   * @param type - The transaction type ('DEPOSIT' or 'WITHDRAW')
   * @param amount - The transaction amount (decimal)
   * @param balanceAfter - The wallet balance after the transaction (decimal)
   * @param timestamp - When the transaction was created
   */
  constructor(
    public readonly transactionId: string,
    public readonly walletId: string,
    public readonly userId: string,
    public readonly type: string,
    public readonly amount: number,
    public readonly balanceAfter: number,
    public readonly timestamp: Date,
  ) {
    super('transaction.processed', walletId);
  }
}
