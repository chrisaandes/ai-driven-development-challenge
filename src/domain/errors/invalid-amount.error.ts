import { DomainError } from './domain-error';

/**
 * Error for invalid monetary amounts (e.g., negative, zero, too many decimals).
 */
export class InvalidAmountError extends DomainError {
  readonly code = 'INVALID_AMOUNT';

  /** Human-readable reason for the validation failure. */
  readonly reason: string;

  constructor(reason: string) {
    super(`Invalid amount: ${reason}`);
    this.reason = reason;
  }
}
