import { DomainError } from './domain-error';
import { Money } from '../value-objects/money.vo';

/**
 * Error thrown when a withdrawal amount exceeds the current wallet balance.
 *
 * Carries both the current balance and the requested amount for
 * rich error reporting at the presentation layer.
 */
export class InsufficientBalanceError extends DomainError {
  readonly code = 'INSUFFICIENT_BALANCE';

  /** The current wallet balance at the time of the failed withdrawal. */
  readonly currentBalance: Money;

  /** The amount the user attempted to withdraw. */
  readonly requestedAmount: Money;

  constructor(currentBalance: Money, requestedAmount: Money) {
    super(
      `Insufficient balance: current balance is ${currentBalance.value}, ` +
        `but requested withdrawal of ${requestedAmount.value}`,
    );
    this.currentBalance = currentBalance;
    this.requestedAmount = requestedAmount;
  }
}
