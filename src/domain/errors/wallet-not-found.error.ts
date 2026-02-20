import { DomainError } from './domain-error';

/**
 * Error when a wallet cannot be found for a given user.
 */
export class WalletNotFoundError extends DomainError {
  readonly code = 'WALLET_NOT_FOUND';

  /** The user ID for which no wallet was found. */
  readonly userId: string;

  constructor(userId: string) {
    super(`Wallet not found for user: ${userId}`);
    this.userId = userId;
  }
}
