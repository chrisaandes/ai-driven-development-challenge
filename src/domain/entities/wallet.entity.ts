import { Money } from '../value-objects/money.vo';
import { TransactionType } from '../value-objects/transaction-type.vo';
import { Result } from '../common/result';
import { DomainError } from '../errors/domain-error';
import { InvalidAmountError } from '../errors/invalid-amount.error';
import { InsufficientBalanceError } from '../errors/insufficient-balance.error';
import { Transaction } from './transaction.entity';
import { DomainEvent } from '../events/domain-event';
import { TransactionProcessedEvent } from '../events/transaction-processed.event';

/**
 * Wallet aggregate root.
 *
 * Encapsulates balance management, deposit/withdrawal business rules,
 * and domain event collection. The wallet is always created through
 * static factory methods -- never through direct construction.
 *
 * Deposits and withdrawals create Transaction entities as a side effect
 * and collect TransactionProcessedEvent domain events for later publishing.
 *
 * @example
 * const wallet = Wallet.create('user-uuid-here');
 * const result = wallet.deposit(Money.of(100));
 * if (result.isSuccess) {
 *   const transaction = result.value;
 *   const events = wallet.pullDomainEvents();
 * }
 */
export class Wallet {
  /** Collected domain events, published after persistence by the application layer. */
  private _domainEvents: DomainEvent[] = [];

  /**
   * Private constructor. Use Wallet.create() or Wallet.reconstitute().
   */
  private constructor(
    private readonly _id: string,
    private readonly _userId: string,
    private _balance: Money,
    private readonly _version: number,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {}

  /**
   * Creates a brand-new wallet for a user with zero balance.
   * This is used when a user makes their first transaction.
   *
   * @param userId - The UUID of the user who owns this wallet
   * @returns A new Wallet instance with zero balance
   *
   * @example
   * const wallet = Wallet.create('550e8400-e29b-41d4-a716-446655440001');
   */
  static create(userId: string): Wallet {
    const now = new Date();
    return new Wallet(
      crypto.randomUUID(),
      userId,
      Money.zero(),
      1,
      now,
      now,
    );
  }

  /**
   * Reconstitutes a wallet from persistence data.
   * Skips validation and does not emit domain events.
   * Used by repository implementations to hydrate domain objects.
   *
   * @param props - The raw persistence data
   * @returns A reconstituted Wallet instance
   */
  static reconstitute(props: {
    id: string;
    userId: string;
    balance: Money;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): Wallet {
    return new Wallet(
      props.id,
      props.userId,
      props.balance,
      props.version,
      props.createdAt,
      props.updatedAt,
    );
  }

  /**
   * Deposits funds into this wallet.
   *
   * Business rules:
   * - Amount must be positive (greater than zero).
   * - Creates a new Transaction entity recording the deposit.
   * - Adds a TransactionProcessedEvent to the domain events queue.
   * - Updates the wallet balance.
   *
   * @param amount - The Money amount to deposit
   * @returns Result containing the created Transaction, or a DomainError
   *
   * @example
   * const result = wallet.deposit(Money.of(100.50));
   * if (result.isSuccess) {
   *   const transaction = result.value; // Transaction entity
   * }
   */
  deposit(amount: Money): Result<Transaction, DomainError> {
    if (amount.isNegativeOrZero()) {
      return Result.fail(
        new InvalidAmountError('Deposit amount must be positive'),
      );
    }

    this._balance = this._balance.add(amount);
    this._updatedAt = new Date();

    const transaction = Transaction.createDeposit(
      this._id,
      this._userId,
      amount,
      this._balance,
    );

    this.addDomainEvent(
      new TransactionProcessedEvent(
        transaction.id,
        this._id,
        this._userId,
        TransactionType.DEPOSIT.value,
        amount.value,
        this._balance.value,
        transaction.createdAt,
      ),
    );

    return Result.ok(transaction);
  }

  /**
   * Withdraws funds from this wallet.
   *
   * Business rules:
   * - Amount must be positive (greater than zero).
   * - Amount must not exceed the current balance (no overdrafts).
   * - Creates a new Transaction entity recording the withdrawal.
   * - Adds a TransactionProcessedEvent to the domain events queue.
   * - Updates the wallet balance.
   *
   * @param amount - The Money amount to withdraw
   * @returns Result containing the created Transaction, or a DomainError
   *
   * @example
   * const result = wallet.withdraw(Money.of(50));
   * if (result.isFailure) {
   *   console.log(result.error); // InsufficientBalanceError
   * }
   */
  withdraw(amount: Money): Result<Transaction, DomainError> {
    if (amount.isNegativeOrZero()) {
      return Result.fail(
        new InvalidAmountError('Withdrawal amount must be positive'),
      );
    }

    if (this._balance.isLessThan(amount)) {
      return Result.fail(
        new InsufficientBalanceError(this._balance, amount),
      );
    }

    this._balance = this._balance.subtract(amount);
    this._updatedAt = new Date();

    const transaction = Transaction.createWithdraw(
      this._id,
      this._userId,
      amount,
      this._balance,
    );

    this.addDomainEvent(
      new TransactionProcessedEvent(
        transaction.id,
        this._id,
        this._userId,
        TransactionType.WITHDRAW.value,
        amount.value,
        this._balance.value,
        transaction.createdAt,
      ),
    );

    return Result.ok(transaction);
  }

  /**
   * Pulls (drains) all collected domain events.
   * After calling this, the internal events list is empty.
   * The application layer calls this after successful persistence
   * to publish events via EventEmitter2.
   *
   * @returns An array of domain events collected since the last pull
   */
  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  /** Unique wallet identifier. */
  get id(): string {
    return this._id;
  }

  /** The user who owns this wallet. */
  get userId(): string {
    return this._userId;
  }

  /** Current wallet balance. */
  get balance(): Money {
    return this._balance;
  }

  /** Optimistic concurrency version. */
  get version(): number {
    return this._version;
  }

  /** Wallet creation timestamp. */
  get createdAt(): Date {
    return this._createdAt;
  }

  /** Last modification timestamp. */
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Adds a domain event to the internal collection.
   * Events are published by the application layer after persistence.
   *
   * @param event - The domain event to collect
   */
  private addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }
}
