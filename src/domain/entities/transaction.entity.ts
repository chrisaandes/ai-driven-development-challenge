import { Money } from '../value-objects/money.vo';
import { TransactionType } from '../value-objects/transaction-type.vo';

/**
 * Transaction entity representing a single financial operation on a wallet.
 *
 * Transactions are immutable once created. They are always produced as
 * side effects of Wallet.deposit() or Wallet.withdraw() and never
 * created independently outside the aggregate root.
 *
 * Each transaction records:
 * - What happened (type: DEPOSIT or WITHDRAW)
 * - How much (amount)
 * - The resulting wallet balance after the operation (balanceAfter)
 *
 * @example
 * // Created internally by Wallet.deposit():
 * const tx = Transaction.createDeposit(walletId, userId, amount, balanceAfter);
 */
export class Transaction {
  /**
   * Private constructor. Use static factory methods or reconstitute().
   */
  private constructor(
    private readonly _id: string,
    private readonly _walletId: string,
    private readonly _userId: string,
    private readonly _type: TransactionType,
    private readonly _amount: Money,
    private readonly _balanceAfter: Money,
    private readonly _createdAt: Date,
  ) {}

  /**
   * Creates a deposit transaction.
   * Called internally by Wallet.deposit().
   *
   * @param walletId - The wallet this transaction belongs to
   * @param userId - The user who performed the transaction
   * @param amount - The deposited amount
   * @param balanceAfter - The wallet balance after the deposit
   * @returns A new Transaction entity
   */
  static createDeposit(
    walletId: string,
    userId: string,
    amount: Money,
    balanceAfter: Money,
  ): Transaction {
    return new Transaction(
      crypto.randomUUID(),
      walletId,
      userId,
      TransactionType.DEPOSIT,
      amount,
      balanceAfter,
      new Date(),
    );
  }

  /**
   * Creates a withdrawal transaction.
   * Called internally by Wallet.withdraw().
   *
   * @param walletId - The wallet this transaction belongs to
   * @param userId - The user who performed the transaction
   * @param amount - The withdrawn amount
   * @param balanceAfter - The wallet balance after the withdrawal
   * @returns A new Transaction entity
   */
  static createWithdraw(
    walletId: string,
    userId: string,
    amount: Money,
    balanceAfter: Money,
  ): Transaction {
    return new Transaction(
      crypto.randomUUID(),
      walletId,
      userId,
      TransactionType.WITHDRAW,
      amount,
      balanceAfter,
      new Date(),
    );
  }

  /**
   * Reconstitutes a transaction from persistence data.
   * Used by repository implementations to hydrate domain objects.
   * No validation or side effects.
   *
   * @param props - The raw persistence data
   * @returns A reconstituted Transaction entity
   */
  static reconstitute(props: {
    id: string;
    walletId: string;
    userId: string;
    type: TransactionType;
    amount: Money;
    balanceAfter: Money;
    createdAt: Date;
  }): Transaction {
    return new Transaction(
      props.id,
      props.walletId,
      props.userId,
      props.type,
      props.amount,
      props.balanceAfter,
      props.createdAt,
    );
  }

  /** Unique transaction identifier (also the idempotency key in the API). */
  get id(): string {
    return this._id;
  }

  /** The wallet this transaction belongs to. */
  get walletId(): string {
    return this._walletId;
  }

  /** The user who performed this transaction. */
  get userId(): string {
    return this._userId;
  }

  /** The transaction type (DEPOSIT or WITHDRAW). */
  get type(): TransactionType {
    return this._type;
  }

  /** The transaction amount. */
  get amount(): Money {
    return this._amount;
  }

  /** The wallet balance after this transaction was applied. */
  get balanceAfter(): Money {
    return this._balanceAfter;
  }

  /** When this transaction was created. */
  get createdAt(): Date {
    return this._createdAt;
  }
}
