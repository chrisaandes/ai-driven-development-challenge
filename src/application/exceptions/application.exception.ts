import { DomainError } from '../../domain/errors/domain-error';
import { InsufficientBalanceError } from '../../domain/errors/insufficient-balance.error';
import { WalletNotFoundError } from '../../domain/errors/wallet-not-found.error';
import { DuplicateTransactionError } from '../../domain/errors/duplicate-transaction.error';
import { InvalidAmountError } from '../../domain/errors/invalid-amount.error';
import { AlertNotFoundError } from '../../domain/errors/alert-not-found.error';
import { AlertAlreadyResolvedError } from '../../domain/errors/alert-already-resolved.error';

/**
 * HTTP status codes mapped from domain error codes.
 */
const ERROR_STATUS_MAP: Record<string, number> = {
  INSUFFICIENT_BALANCE: 422,
  WALLET_NOT_FOUND: 404,
  DUPLICATE_TRANSACTION: 409,
  INVALID_AMOUNT: 400,
  ALERT_NOT_FOUND: 404,
  ALERT_ALREADY_RESOLVED: 422,
};

/**
 * Base application exception that wraps domain errors with HTTP-friendly metadata.
 *
 * The presentation layer exception filter reads statusCode and details
 * to produce a consistent HTTP error response.
 */
export class ApplicationException extends Error {
  /** HTTP status code suitable for this error (e.g., 404, 409, 422). */
  readonly statusCode: number;

  /** Machine-readable error code from the underlying domain error. */
  readonly code: string;

  /** Optional structured details for richer error responses. */
  readonly details?: Record<string, unknown>;

  /**
   * Creates an ApplicationException from a DomainError.
   *
   * @param domainError - The domain error to wrap
   */
  constructor(domainError: DomainError) {
    super(domainError.message);
    this.name = 'ApplicationException';
    this.code = domainError.code;
    this.statusCode = ERROR_STATUS_MAP[domainError.code] ?? 500;
    this.details = ApplicationException.extractDetails(domainError);
  }

  /**
   * Extracts structured details from known domain error subtypes.
   *
   * @param error - The domain error
   * @returns Additional details for the response, or undefined
   */
  private static extractDetails(
    error: DomainError,
  ): Record<string, unknown> | undefined {
    if (error instanceof InsufficientBalanceError) {
      return {
        currentBalance: error.currentBalance.value,
        requestedAmount: error.requestedAmount.value,
      };
    }
    if (error instanceof WalletNotFoundError) {
      return { userId: error.userId };
    }
    if (error instanceof DuplicateTransactionError) {
      return { transactionId: error.transactionId };
    }
    if (error instanceof InvalidAmountError) {
      return { reason: error.reason };
    }
    if (error instanceof AlertNotFoundError) {
      return { alertId: error.alertId };
    }
    if (error instanceof AlertAlreadyResolvedError) {
      return { alertId: error.alertId };
    }
    return undefined;
  }
}
