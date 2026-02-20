import { DomainError } from './domain-error';

/**
 * Error when attempting to create a wallet for a user who already has one.
 */
export class WalletAlreadyExistsError extends DomainError {
  readonly code = 'WALLET_ALREADY_EXISTS';

  /** The user ID that already has an associated wallet. */
  readonly userId: string;

  constructor(userId: string) {
    super(`Wallet already exists for user: ${userId}`);
    this.userId = userId;
  }
}
