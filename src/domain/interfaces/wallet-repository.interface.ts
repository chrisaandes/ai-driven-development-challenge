import { Wallet } from '../entities/wallet.entity';

/**
 * Port for wallet persistence operations.
 *
 * Implemented by PrismaWalletRepository in the infrastructure layer.
 * Injected into use cases via INJECTION_TOKENS.WALLET_REPOSITORY.
 */
export interface IWalletRepository {
  /**
   * Finds a wallet by user ID.
   *
   * @param userId - The user's UUID
   * @returns The wallet if found, null otherwise
   */
  findByUserId(userId: string): Promise<Wallet | null>;

  /**
   * Finds a wallet by user ID with a pessimistic lock (SELECT ... FOR UPDATE).
   * Must be called within a database transaction.
   * Prevents concurrent modifications to the wallet balance.
   *
   * @param userId - The user's UUID
   * @returns The locked wallet if found, null otherwise
   */
  findByUserIdWithLock(userId: string): Promise<Wallet | null>;

  /**
   * Persists a wallet (insert or update).
   * Uses upsert pattern: inserts if new, updates if existing.
   *
   * @param wallet - The wallet entity to persist
   */
  save(wallet: Wallet): Promise<void>;
}
