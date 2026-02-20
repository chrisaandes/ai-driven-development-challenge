# Domain Model Design: Core Transactions & Fraud Detection

**Author**: architect agent
**Date**: 2026-02-20
**Phase**: 2 - Design
**Status**: COMPLETE

---

## Table of Contents

1. [Domain Model Overview](#1-domain-model-overview)
2. [Value Objects](#2-value-objects)
3. [Entities](#3-entities)
4. [Domain Errors](#4-domain-errors)
5. [Result Pattern](#5-result-pattern)
6. [Domain Events](#6-domain-events)
7. [Repository Interfaces (Ports)](#7-repository-interfaces-ports)
8. [Domain Services](#8-domain-services)
9. [File Structure](#9-file-structure)
10. [Integration Notes](#10-integration-notes)

---

## 1. Domain Model Overview

### 1.1 Class Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              DOMAIN LAYER                                    │
│                        (Zero framework dependencies)                         │
│                                                                              │
│  ┌─────────────────┐                                                         │
│  │   <<common>>     │                                                        │
│  │   Result<T, E>   │   Used by all entities as return type                  │
│  └─────────────────┘                                                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────┐                         │
│  │              VALUE OBJECTS (Immutable)           │                         │
│  │                                                  │                         │
│  │  ┌───────────┐  ┌────────────────┐              │                         │
│  │  │   Money    │  │ TransactionType│              │                         │
│  │  │           │  │  DEPOSIT       │              │                         │
│  │  │ _cents:int │  │  WITHDRAW     │              │                         │
│  │  │ of()      │  │  isDeposit()  │              │                         │
│  │  │ fromCents()│  │  isWithdraw() │              │                         │
│  │  │ zero()    │  └────────────────┘              │                         │
│  │  │ add()     │                                   │                         │
│  │  │ subtract()│  ┌────────────────┐              │                         │
│  │  │ multiply()│  │ TransactionId  │              │                         │
│  │  │ value     │  │  _value: UUID  │              │                         │
│  │  │ cents     │  │  generate()   │              │                         │
│  │  └───────────┘  │  fromString() │              │                         │
│  │                  └────────────────┘              │                         │
│  │                  ┌────────────────┐              │                         │
│  │                  │    UserId      │              │                         │
│  │                  │  _value: UUID  │              │                         │
│  │                  │  generate()   │              │                         │
│  │                  │  fromString() │              │                         │
│  │                  └────────────────┘              │                         │
│  └─────────────────────────────────────────────────┘                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────┐                         │
│  │                   ENTITIES                       │                         │
│  │                                                  │                         │
│  │  ┌──────────────────────┐    creates             │                         │
│  │  │       Wallet          │ ──────────┐           │                         │
│  │  │  (Aggregate Root)     │           │           │                         │
│  │  │                       │           ▼           │                         │
│  │  │  _id: string          │  ┌─────────────────┐  │                         │
│  │  │  _userId: UserId      │  │  Transaction    │  │                         │
│  │  │  _balance: Money      │  │                 │  │                         │
│  │  │  _version: number     │  │  _id: TxId     │  │                         │
│  │  │  _createdAt: Date     │  │  _walletId     │  │                         │
│  │  │  _updatedAt: Date     │  │  _userId       │  │                         │
│  │  │  _domainEvents[]      │  │  _type: TxType │  │                         │
│  │  │                       │  │  _amount: Money │  │                         │
│  │  │  create()             │  │  _balanceAfter  │  │                         │
│  │  │  reconstitute()       │  │  _createdAt    │  │                         │
│  │  │  deposit(): Result    │  │                 │  │                         │
│  │  │  withdraw(): Result   │  │  createDeposit()│  │                         │
│  │  │  pullDomainEvents()   │  │  createWithdraw()│ │                         │
│  │  └──────────────────────┘  │  reconstitute() │  │                         │
│  │                             └─────────────────┘  │                         │
│  │  ┌──────────────────────┐                        │                         │
│  │  │     FraudAlert       │                        │                         │
│  │  │                      │                        │                         │
│  │  │  _id: string         │                        │                         │
│  │  │  _transactionId      │                        │                         │
│  │  │  _userId             │                        │                         │
│  │  │  _alertType          │                        │                         │
│  │  │  _severity           │                        │                         │
│  │  │  _details: Record    │                        │                         │
│  │  │  _resolved: boolean  │                        │                         │
│  │  │                      │                        │                         │
│  │  │  create()            │                        │                         │
│  │  │  resolve(): Result   │                        │                         │
│  │  └──────────────────────┘                        │                         │
│  └─────────────────────────────────────────────────┘                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────┐                         │
│  │              DOMAIN SERVICES                     │                         │
│  │                                                  │                         │
│  │  ┌───────────────────────────┐                   │                         │
│  │  │  FraudDetectionService    │                   │                         │
│  │  │                           │                   │                         │
│  │  │  analyze(tx, recentTxs)   │                   │                         │
│  │  │   -> FraudAnalysisResult  │                   │                         │
│  │  └───────────────────────────┘                   │                         │
│  └─────────────────────────────────────────────────┘                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────┐                         │
│  │           REPOSITORY PORTS (Interfaces)          │                         │
│  │                                                  │                         │
│  │  IWalletRepository                               │                         │
│  │  ITransactionRepository                          │                         │
│  │  IFraudAlertRepository                           │                         │
│  └─────────────────────────────────────────────────┘                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────┐                         │
│  │              DOMAIN ERRORS                       │                         │
│  │                                                  │                         │
│  │  DomainError (base)                              │                         │
│  │  ├── InsufficientBalanceError                    │                         │
│  │  ├── InvalidAmountError                          │                         │
│  │  ├── WalletNotFoundError                         │                         │
│  │  ├── WalletAlreadyExistsError                    │                         │
│  │  ├── TransactionNotFoundError                    │                         │
│  │  ├── AlertNotFoundError                          │                         │
│  │  ├── AlertAlreadyResolvedError                   │                         │
│  │  └── DuplicateTransactionError                   │                         │
│  └─────────────────────────────────────────────────┘                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────┐                         │
│  │              DOMAIN EVENTS                       │                         │
│  │                                                  │                         │
│  │  DomainEvent (base)                              │                         │
│  │  ├── TransactionProcessedEvent                   │                         │
│  │  └── FraudAlertCreatedEvent                      │                         │
│  └─────────────────────────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Dependency Direction Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    PRESENTATION LAYER                             │
│       Controllers, Filters, Decorators, Request DTOs             │
│       NestJS decorators (@Controller, @Get, @Post)               │
│                          │                                       │
│                          │ depends on                             │
│                          ▼                                       │
│                    APPLICATION LAYER                              │
│       Use Cases, Application DTOs, ApplicationException          │
│       NestJS decorators (@Injectable, @Inject)                   │
│       EventEmitter2 for publishing domain events                 │
│                          │                                       │
│                          │ depends on                             │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    DOMAIN LAYER                          │    │
│  │     Entities, Value Objects, Repository Interfaces       │    │
│  │     Domain Services, Domain Events, Domain Errors        │    │
│  │     Result<T, E>                                         │    │
│  │                                                          │    │
│  │     >>> ZERO external dependencies <<<                   │    │
│  │     >>> No @Injectable, No NestJS, No Prisma <<<         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ▲                                       │
│                          │ implements interfaces                  │
│                          │                                       │
│                  INFRASTRUCTURE LAYER                             │
│       Repository Implementations (Prisma), PrismaService         │
│       External service integrations                              │
│       NestJS decorators (@Injectable)                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

KEY:
  ──▶  "depends on" (allowed direction)
  ──▲  "implements" (infrastructure implements domain interfaces)

FORBIDDEN:
  Domain ──▶ Application (NEVER)
  Domain ──▶ Infrastructure (NEVER)
  Domain ──▶ Presentation (NEVER)
  Application ──▶ Presentation (NEVER)
  Infrastructure ──▶ Application (NEVER, except ApplicationException)
```

---

## 2. Value Objects

All value objects are immutable. Every operation returns a new instance. They have no identity -- equality is determined by their attribute values.

### 2.1 Money Value Object

**File**: `src/domain/value-objects/money.vo.ts`

Money stores amounts as integer cents to eliminate floating-point precision errors in financial calculations. The private constructor ensures all instances pass validation. Every arithmetic operation returns a new `Money` instance.

```typescript
// src/domain/value-objects/money.vo.ts

/**
 * Value object representing a monetary amount.
 *
 * Stores the amount internally as integer cents to avoid
 * floating-point precision errors in financial calculations.
 * All operations are immutable and return new Money instances.
 *
 * @example
 * const price = Money.of(100.50);     // 10050 cents internally
 * const tax = Money.of(10.05);        // 1005 cents internally
 * const total = price.add(tax);       // 11055 cents = 110.55
 * console.log(total.value);           // 110.55
 * console.log(total.cents);           // 11055
 */
export class Money {
  /** Maximum monetary value: 999,999,999.99 */
  private static readonly MAX_CENTS = 99_999_999_999;

  /**
   * Private constructor. Use static factory methods to create instances.
   * @param _cents - The amount stored as integer cents.
   */
  private constructor(private readonly _cents: number) {
    if (!Number.isFinite(_cents)) {
      throw new Error('Money amount must be a finite number');
    }
    if (!Number.isInteger(_cents)) {
      throw new Error('Money internal value must be an integer (cents)');
    }
    if (Math.abs(_cents) > Money.MAX_CENTS) {
      throw new Error(
        `Money amount exceeds maximum allowed value of 999,999,999.99 (got ${_cents / 100})`,
      );
    }
  }

  /**
   * Creates a Money instance from a decimal amount.
   * Rounds to nearest cent to handle floating-point imprecision.
   *
   * @param amount - Decimal amount (e.g., 100.50)
   * @returns A new Money instance
   * @throws Error if amount is not finite, exceeds max value, or has more than 2 decimal places
   *
   * @example
   * const money = Money.of(100.50); // 10050 cents
   */
  static of(amount: number): Money {
    if (!Number.isFinite(amount)) {
      throw new Error('Money amount must be a finite number');
    }

    // Check for more than 2 decimal places
    const decimalStr = amount.toString();
    const decimalIndex = decimalStr.indexOf('.');
    if (decimalIndex !== -1) {
      const decimalPlaces = decimalStr.length - decimalIndex - 1;
      if (decimalPlaces > 2) {
        throw new Error(
          `Money amount must have at most 2 decimal places (got ${decimalPlaces})`,
        );
      }
    }

    const cents = Math.round(amount * 100);
    return new Money(cents);
  }

  /**
   * Creates a Money instance from integer cents.
   *
   * @param cents - Integer cents (e.g., 10050 for $100.50)
   * @returns A new Money instance
   * @throws Error if cents is not an integer or exceeds max value
   *
   * @example
   * const money = Money.fromCents(10050); // represents 100.50
   */
  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) {
      throw new Error('Cents must be an integer');
    }
    return new Money(cents);
  }

  /**
   * Creates a Money instance representing zero.
   *
   * @returns A new Money instance with value 0
   *
   * @example
   * const zero = Money.zero();
   * console.log(zero.value); // 0
   */
  static zero(): Money {
    return new Money(0);
  }

  /**
   * Returns the decimal representation of the amount.
   *
   * @example
   * Money.of(100.50).value // 100.50
   */
  get value(): number {
    return this._cents / 100;
  }

  /**
   * Returns the raw integer cents.
   *
   * @example
   * Money.of(100.50).cents // 10050
   */
  get cents(): number {
    return this._cents;
  }

  /**
   * Adds another Money amount to this one.
   * Returns a new Money instance (immutable).
   *
   * @param other - The Money amount to add
   * @returns A new Money instance with the sum
   *
   * @example
   * Money.of(100).add(Money.of(50)) // Money representing 150.00
   */
  add(other: Money): Money {
    return new Money(this._cents + other._cents);
  }

  /**
   * Subtracts another Money amount from this one.
   * Returns a new Money instance (immutable).
   * The result can be negative.
   *
   * @param other - The Money amount to subtract
   * @returns A new Money instance with the difference
   *
   * @example
   * Money.of(100).subtract(Money.of(30)) // Money representing 70.00
   */
  subtract(other: Money): Money {
    return new Money(this._cents - other._cents);
  }

  /**
   * Multiplies this Money by a scalar factor.
   * Result is rounded to the nearest cent.
   *
   * @param factor - The scalar to multiply by
   * @returns A new Money instance with the product
   *
   * @example
   * Money.of(100).multiply(1.5) // Money representing 150.00
   */
  multiply(factor: number): Money {
    if (!Number.isFinite(factor)) {
      throw new Error('Multiplication factor must be a finite number');
    }
    return new Money(Math.round(this._cents * factor));
  }

  /**
   * Returns true if this amount is less than the other.
   *
   * @param other - The Money amount to compare against
   * @returns true if this < other
   */
  isLessThan(other: Money): boolean {
    return this._cents < other._cents;
  }

  /**
   * Returns true if this amount is greater than the other.
   *
   * @param other - The Money amount to compare against
   * @returns true if this > other
   */
  isGreaterThan(other: Money): boolean {
    return this._cents > other._cents;
  }

  /**
   * Returns true if this amount is negative or zero.
   *
   * @returns true if cents <= 0
   */
  isNegativeOrZero(): boolean {
    return this._cents <= 0;
  }

  /**
   * Returns true if this Money has the same amount as the other.
   *
   * @param other - The Money amount to compare against
   * @returns true if both represent the same cent value
   */
  equals(other: Money): boolean {
    return this._cents === other._cents;
  }

  /**
   * Returns a string representation for debugging.
   */
  toString(): string {
    return `Money(${this.value.toFixed(2)})`;
  }
}
```

### 2.2 TransactionType Value Object

**File**: `src/domain/value-objects/transaction-type.vo.ts`

```typescript
// src/domain/value-objects/transaction-type.vo.ts

/**
 * Value object representing the type of a financial transaction.
 * Acts as a type-safe enum with behavior methods.
 *
 * @example
 * const type = TransactionType.DEPOSIT;
 * if (type.isDeposit()) { ... }
 */
export class TransactionType {
  /** Deposit transaction: adds funds to wallet. */
  static readonly DEPOSIT = new TransactionType('DEPOSIT');

  /** Withdraw transaction: removes funds from wallet. */
  static readonly WITHDRAW = new TransactionType('WITHDRAW');

  /** All valid transaction types. */
  private static readonly VALID_TYPES: ReadonlyMap<string, TransactionType> = new Map([
    ['DEPOSIT', TransactionType.DEPOSIT],
    ['WITHDRAW', TransactionType.WITHDRAW],
  ]);

  /**
   * Private constructor. Use static members or fromString().
   * @param _value - The string representation of the type
   */
  private constructor(private readonly _value: string) {}

  /**
   * Creates a TransactionType from a string.
   *
   * @param value - The transaction type string (case-insensitive)
   * @returns The corresponding TransactionType instance
   * @throws Error if the string is not a valid type
   *
   * @example
   * const type = TransactionType.fromString('deposit'); // TransactionType.DEPOSIT
   */
  static fromString(value: string): TransactionType {
    const normalized = value.toUpperCase();
    const type = TransactionType.VALID_TYPES.get(normalized);
    if (!type) {
      throw new Error(
        `Invalid transaction type: "${value}". Must be one of: DEPOSIT, WITHDRAW`,
      );
    }
    return type;
  }

  /**
   * Returns the string value of this type.
   */
  get value(): string {
    return this._value;
  }

  /**
   * Returns true if this is a deposit transaction.
   */
  isDeposit(): boolean {
    return this === TransactionType.DEPOSIT;
  }

  /**
   * Returns true if this is a withdraw transaction.
   */
  isWithdraw(): boolean {
    return this === TransactionType.WITHDRAW;
  }

  /**
   * Equality check based on the underlying string value.
   */
  equals(other: TransactionType): boolean {
    return this._value === other._value;
  }

  /**
   * Returns the string representation.
   */
  toString(): string {
    return this._value;
  }
}
```

### 2.3 TransactionId Value Object

**File**: `src/domain/value-objects/transaction-id.vo.ts`

```typescript
// src/domain/value-objects/transaction-id.vo.ts

/**
 * Value object wrapping a transaction UUID.
 * Ensures all transaction IDs are valid UUID v4 strings.
 *
 * @example
 * const id = TransactionId.generate();
 * const id2 = TransactionId.fromString('550e8400-e29b-41d4-a716-446655440000');
 */
export class TransactionId {
  /** UUID v4 regex pattern. */
  private static readonly UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * Private constructor. Use static factory methods.
   * @param _value - A validated UUID v4 string
   */
  private constructor(private readonly _value: string) {}

  /**
   * Generates a new random TransactionId.
   *
   * @returns A new TransactionId with a random UUID v4
   *
   * @example
   * const id = TransactionId.generate();
   */
  static generate(): TransactionId {
    return new TransactionId(crypto.randomUUID());
  }

  /**
   * Creates a TransactionId from an existing UUID string.
   *
   * @param id - A UUID v4 string
   * @returns A new TransactionId
   * @throws Error if the string is not a valid UUID v4
   *
   * @example
   * const id = TransactionId.fromString('550e8400-e29b-41d4-a716-446655440000');
   */
  static fromString(id: string): TransactionId {
    if (!TransactionId.UUID_V4_REGEX.test(id)) {
      throw new Error(`Invalid transaction ID: "${id}". Must be a valid UUID v4.`);
    }
    return new TransactionId(id);
  }

  /**
   * Returns the underlying UUID string.
   */
  get value(): string {
    return this._value;
  }

  /**
   * Equality check based on the UUID string.
   */
  equals(other: TransactionId): boolean {
    return this._value === other._value;
  }

  /**
   * Returns the UUID string.
   */
  toString(): string {
    return this._value;
  }
}
```

### 2.4 UserId Value Object

**File**: `src/domain/value-objects/user-id.vo.ts`

```typescript
// src/domain/value-objects/user-id.vo.ts

/**
 * Value object wrapping a user UUID.
 * Ensures all user IDs are valid UUID v4 strings.
 *
 * @example
 * const userId = UserId.generate();
 * const userId2 = UserId.fromString('550e8400-e29b-41d4-a716-446655440001');
 */
export class UserId {
  /** UUID v4 regex pattern. */
  private static readonly UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * Private constructor. Use static factory methods.
   * @param _value - A validated UUID v4 string
   */
  private constructor(private readonly _value: string) {}

  /**
   * Generates a new random UserId.
   *
   * @returns A new UserId with a random UUID v4
   *
   * @example
   * const id = UserId.generate();
   */
  static generate(): UserId {
    return new UserId(crypto.randomUUID());
  }

  /**
   * Creates a UserId from an existing UUID string.
   *
   * @param id - A UUID v4 string
   * @returns A new UserId
   * @throws Error if the string is not a valid UUID v4
   *
   * @example
   * const id = UserId.fromString('550e8400-e29b-41d4-a716-446655440001');
   */
  static fromString(id: string): UserId {
    if (!UserId.UUID_V4_REGEX.test(id)) {
      throw new Error(`Invalid user ID: "${id}". Must be a valid UUID v4.`);
    }
    return new UserId(id);
  }

  /**
   * Returns the underlying UUID string.
   */
  get value(): string {
    return this._value;
  }

  /**
   * Equality check based on the UUID string.
   */
  equals(other: UserId): boolean {
    return this._value === other._value;
  }

  /**
   * Returns the UUID string.
   */
  toString(): string {
    return this._value;
  }
}
```

---

## 3. Entities

### 3.1 Wallet Entity

**File**: `src/domain/entities/wallet.entity.ts`

The Wallet is the **aggregate root** for transaction processing. It owns the business rules for deposits and withdrawals, manages balance invariants, and collects domain events for later publishing by the application layer.

```typescript
// src/domain/entities/wallet.entity.ts

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
```

### 3.2 Transaction Entity

**File**: `src/domain/entities/transaction.entity.ts`

```typescript
// src/domain/entities/transaction.entity.ts

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
```

### 3.3 FraudAlert Entity

**File**: `src/domain/entities/fraud-alert.entity.ts`

```typescript
// src/domain/entities/fraud-alert.entity.ts

import { Result } from '../common/result';
import { DomainError } from '../errors/domain-error';
import { AlertAlreadyResolvedError } from '../errors/alert-already-resolved.error';

/**
 * Alert types for fraud detection.
 */
export type FraudAlertType = 'HIGH_AMOUNT' | 'VELOCITY';

/**
 * Severity levels for fraud alerts.
 */
export type FraudAlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * FraudAlert entity representing a detected suspicious pattern.
 *
 * Alerts are created by the FraudDetectionService when a transaction
 * matches a fraud detection rule. They start as unresolved and can be
 * resolved by a system operator with resolution notes.
 *
 * Severity calculation:
 *
 * HIGH_AMOUNT alerts:
 *   - LOW:    amount > threshold AND amount < 2x threshold
 *   - MEDIUM: amount >= 2x threshold AND amount < 5x threshold
 *   - HIGH:   amount >= 5x threshold
 *
 * VELOCITY alerts:
 *   - MEDIUM:   count > max
 *   - HIGH:     count > 2x max
 *   - CRITICAL: count > 5x max
 *
 * @example
 * const alert = FraudAlert.create({
 *   transactionId: 'tx-uuid',
 *   userId: 'user-uuid',
 *   alertType: 'HIGH_AMOUNT',
 *   severity: 'MEDIUM',
 *   details: { amount: 25000, threshold: 10000 },
 * });
 */
export class FraudAlert {
  /**
   * Private constructor. Use FraudAlert.create() or FraudAlert.reconstitute().
   */
  private constructor(
    private readonly _id: string,
    private readonly _transactionId: string,
    private readonly _userId: string,
    private readonly _alertType: FraudAlertType,
    private readonly _severity: FraudAlertSeverity,
    private readonly _details: Record<string, unknown>,
    private _resolved: boolean,
    private _resolvedAt: Date | null,
    private _resolutionNotes: string | null,
    private readonly _createdAt: Date,
  ) {}

  /**
   * Creates a new unresolved fraud alert.
   *
   * @param props - The alert properties
   * @returns A new FraudAlert entity
   */
  static create(props: {
    transactionId: string;
    userId: string;
    alertType: FraudAlertType;
    severity: FraudAlertSeverity;
    details: Record<string, unknown>;
  }): FraudAlert {
    return new FraudAlert(
      crypto.randomUUID(),
      props.transactionId,
      props.userId,
      props.alertType,
      props.severity,
      props.details,
      false,
      null,
      null,
      new Date(),
    );
  }

  /**
   * Reconstitutes a fraud alert from persistence data.
   *
   * @param props - The raw persistence data
   * @returns A reconstituted FraudAlert entity
   */
  static reconstitute(props: {
    id: string;
    transactionId: string;
    userId: string;
    alertType: FraudAlertType;
    severity: FraudAlertSeverity;
    details: Record<string, unknown>;
    resolved: boolean;
    resolvedAt: Date | null;
    resolutionNotes: string | null;
    createdAt: Date;
  }): FraudAlert {
    return new FraudAlert(
      props.id,
      props.transactionId,
      props.userId,
      props.alertType,
      props.severity,
      props.details,
      props.resolved,
      props.resolvedAt,
      props.resolutionNotes,
      props.createdAt,
    );
  }

  /**
   * Calculates the severity for a HIGH_AMOUNT alert based on how much the
   * transaction amount exceeds the configured threshold.
   *
   * @param amount - The transaction amount (decimal)
   * @param threshold - The configured amount threshold (decimal)
   * @returns The calculated severity level
   *
   * Tiers:
   *   - amount >= 5x threshold => HIGH
   *   - amount >= 2x threshold => MEDIUM
   *   - amount >  threshold    => LOW
   */
  static calculateAmountSeverity(
    amount: number,
    threshold: number,
  ): FraudAlertSeverity {
    if (amount >= threshold * 5) {
      return 'HIGH';
    }
    if (amount >= threshold * 2) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Calculates the severity for a VELOCITY alert based on how much the
   * transaction count exceeds the configured maximum.
   *
   * @param count - The number of transactions in the window
   * @param maxTransactions - The configured max transactions per window
   * @returns The calculated severity level
   *
   * Tiers:
   *   - count > 5x max => CRITICAL
   *   - count > 2x max => HIGH
   *   - count > max    => MEDIUM
   */
  static calculateVelocitySeverity(
    count: number,
    maxTransactions: number,
  ): FraudAlertSeverity {
    if (count > maxTransactions * 5) {
      return 'CRITICAL';
    }
    if (count > maxTransactions * 2) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }

  /**
   * Marks this alert as resolved with the given notes.
   *
   * Business rules:
   * - An alert can only be resolved once.
   * - Resolution notes are required.
   *
   * @param notes - The resolution notes explaining the decision
   * @returns Result.ok(void) on success, or Result.fail(AlertAlreadyResolvedError)
   */
  resolve(notes: string): Result<void, DomainError> {
    if (this._resolved) {
      return Result.fail(
        new AlertAlreadyResolvedError(this._id),
      );
    }

    this._resolved = true;
    this._resolvedAt = new Date();
    this._resolutionNotes = notes;

    return Result.ok(undefined);
  }

  /** Unique alert identifier. */
  get id(): string {
    return this._id;
  }

  /** The transaction that triggered this alert. */
  get transactionId(): string {
    return this._transactionId;
  }

  /** The user associated with this alert. */
  get userId(): string {
    return this._userId;
  }

  /** The type of fraud detected (HIGH_AMOUNT or VELOCITY). */
  get alertType(): FraudAlertType {
    return this._alertType;
  }

  /** The severity level of this alert. */
  get severity(): FraudAlertSeverity {
    return this._severity;
  }

  /** Additional details about the alert (e.g., amounts, counts, thresholds). */
  get details(): Record<string, unknown> {
    return { ...this._details };
  }

  /** Whether this alert has been resolved. */
  get resolved(): boolean {
    return this._resolved;
  }

  /** When this alert was resolved (null if unresolved). */
  get resolvedAt(): Date | null {
    return this._resolvedAt;
  }

  /** Resolution notes (null if unresolved). */
  get resolutionNotes(): string | null {
    return this._resolutionNotes;
  }

  /** When this alert was created. */
  get createdAt(): Date {
    return this._createdAt;
  }
}
```

---

## 4. Domain Errors

All domain errors extend a common `DomainError` base class. The domain layer returns these errors inside `Result.fail()` instead of throwing them. The application layer translates them into `ApplicationException` instances.

### 4.1 Base DomainError

**File**: `src/domain/errors/domain-error.ts`

```typescript
// src/domain/errors/domain-error.ts

/**
 * Base class for all domain-level errors.
 *
 * Domain errors represent business rule violations. They are never thrown
 * in the domain layer -- they are returned inside Result.fail() instead.
 * The application layer catches them and translates to ApplicationException.
 *
 * Each subclass provides a unique `code` string for programmatic identification.
 */
export abstract class DomainError extends Error {
  /**
   * Machine-readable error code (e.g., 'INSUFFICIENT_BALANCE').
   * Used by the application layer for error mapping.
   */
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

### 4.2 InsufficientBalanceError

**File**: `src/domain/errors/insufficient-balance.error.ts`

```typescript
// src/domain/errors/insufficient-balance.error.ts

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
```

### 4.3 InvalidAmountError

**File**: `src/domain/errors/invalid-amount.error.ts`

```typescript
// src/domain/errors/invalid-amount.error.ts

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
```

### 4.4 WalletNotFoundError

**File**: `src/domain/errors/wallet-not-found.error.ts`

```typescript
// src/domain/errors/wallet-not-found.error.ts

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
```

### 4.5 WalletAlreadyExistsError

**File**: `src/domain/errors/wallet-already-exists.error.ts`

```typescript
// src/domain/errors/wallet-already-exists.error.ts

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
```

### 4.6 TransactionNotFoundError

**File**: `src/domain/errors/transaction-not-found.error.ts`

```typescript
// src/domain/errors/transaction-not-found.error.ts

import { DomainError } from './domain-error';

/**
 * Error when a transaction cannot be found by its ID.
 */
export class TransactionNotFoundError extends DomainError {
  readonly code = 'TRANSACTION_NOT_FOUND';

  /** The transaction ID that was not found. */
  readonly transactionId: string;

  constructor(transactionId: string) {
    super(`Transaction not found: ${transactionId}`);
    this.transactionId = transactionId;
  }
}
```

### 4.7 AlertNotFoundError

**File**: `src/domain/errors/alert-not-found.error.ts`

```typescript
// src/domain/errors/alert-not-found.error.ts

import { DomainError } from './domain-error';

/**
 * Error when a fraud alert cannot be found by its ID.
 */
export class AlertNotFoundError extends DomainError {
  readonly code = 'ALERT_NOT_FOUND';

  /** The alert ID that was not found. */
  readonly alertId: string;

  constructor(alertId: string) {
    super(`Fraud alert not found: ${alertId}`);
    this.alertId = alertId;
  }
}
```

### 4.8 AlertAlreadyResolvedError

**File**: `src/domain/errors/alert-already-resolved.error.ts`

```typescript
// src/domain/errors/alert-already-resolved.error.ts

import { DomainError } from './domain-error';

/**
 * Error when attempting to resolve a fraud alert that is already resolved.
 */
export class AlertAlreadyResolvedError extends DomainError {
  readonly code = 'ALERT_ALREADY_RESOLVED';

  /** The alert ID that was already resolved. */
  readonly alertId: string;

  constructor(alertId: string) {
    super(`Fraud alert already resolved: ${alertId}`);
    this.alertId = alertId;
  }
}
```

### 4.9 DuplicateTransactionError

**File**: `src/domain/errors/duplicate-transaction.error.ts`

```typescript
// src/domain/errors/duplicate-transaction.error.ts

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
```

### 4.3 Domain Errors Index

**File**: `src/domain/errors/index.ts`

```typescript
// src/domain/errors/index.ts

export { DomainError } from './domain-error';
export { InsufficientBalanceError } from './insufficient-balance.error';
export { InvalidAmountError } from './invalid-amount.error';
export { WalletNotFoundError } from './wallet-not-found.error';
export { WalletAlreadyExistsError } from './wallet-already-exists.error';
export { TransactionNotFoundError } from './transaction-not-found.error';
export { AlertNotFoundError } from './alert-not-found.error';
export { AlertAlreadyResolvedError } from './alert-already-resolved.error';
export { DuplicateTransactionError } from './duplicate-transaction.error';
```

---

## 5. Result Pattern

**File**: `src/domain/common/result.ts`

The `Result<T, E>` type is a discriminated union that makes success and failure explicit in the type system. Domain methods return `Result` instead of throwing exceptions, which makes their failure modes visible in the function signature and enforces that callers handle both cases.

```typescript
// src/domain/common/result.ts

/**
 * A discriminated union type representing either a success value (T)
 * or a failure error (E).
 *
 * Domain methods return Result instead of throwing exceptions,
 * making failure modes explicit in the type signature.
 *
 * @typeParam T - The success value type
 * @typeParam E - The error type (defaults to Error)
 *
 * @example
 * // Creating results:
 * const success = Result.ok(42);
 * const failure = Result.fail(new InsufficientBalanceError(...));
 *
 * // Consuming results:
 * if (result.isSuccess) {
 *   console.log(result.value);
 * } else {
 *   console.log(result.error.message);
 * }
 *
 * // Chaining operations:
 * const doubled = result.map(x => x * 2);
 * const chained = result.flatMap(x => anotherOperation(x));
 */
export class Result<T, E extends Error = Error> {
  /**
   * Private constructor. Use Result.ok() or Result.fail().
   */
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  /**
   * Creates a successful result containing a value.
   *
   * @param value - The success value
   * @returns A successful Result<T, never>
   *
   * @example
   * const result = Result.ok(42);
   * result.isSuccess // true
   * result.value     // 42
   */
  static ok<T>(value: T): Result<T, never> {
    return new Result<T, never>(true, value, undefined);
  }

  /**
   * Creates a failed result containing an error.
   *
   * @param error - The error
   * @returns A failed Result<never, E>
   *
   * @example
   * const result = Result.fail(new Error('Something went wrong'));
   * result.isFailure // true
   * result.error     // Error('Something went wrong')
   */
  static fail<E extends Error>(error: E): Result<never, E> {
    return new Result<never, E>(false, undefined, error);
  }

  /**
   * Returns true if the result represents success.
   */
  get isSuccess(): boolean {
    return this._isSuccess;
  }

  /**
   * Returns true if the result represents failure.
   */
  get isFailure(): boolean {
    return !this._isSuccess;
  }

  /**
   * Returns the success value.
   * Throws an Error if the result is a failure.
   *
   * @throws Error if the result is a failure
   */
  get value(): T {
    if (!this._isSuccess) {
      throw new Error(
        `Cannot access value of a failed Result. Error: ${this._error?.message}`,
      );
    }
    return this._value as T;
  }

  /**
   * Returns the error.
   * Throws an Error if the result is a success.
   *
   * @throws Error if the result is a success
   */
  get error(): E {
    if (this._isSuccess) {
      throw new Error('Cannot access error of a successful Result.');
    }
    return this._error as E;
  }

  /**
   * Transforms the success value using the provided function.
   * If the result is a failure, the mapper is not called and
   * the error propagates unchanged.
   *
   * @param fn - The transformation function
   * @returns A new Result with the transformed value, or the original error
   *
   * @example
   * Result.ok(10).map(x => x * 2)         // Result.ok(20)
   * Result.fail(err).map(x => x * 2)      // Result.fail(err)
   */
  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this._isSuccess) {
      return Result.ok(fn(this._value as T));
    }
    return Result.fail(this._error as E);
  }

  /**
   * Chains another Result-returning operation.
   * If the result is a failure, the function is not called and
   * the error propagates unchanged.
   *
   * @param fn - A function that returns a new Result
   * @returns The result of the chained operation, or the original error
   *
   * @example
   * Result.ok(10).flatMap(x => Result.ok(x * 2))     // Result.ok(20)
   * Result.ok(10).flatMap(x => Result.fail(err))      // Result.fail(err)
   * Result.fail(err).flatMap(x => Result.ok(x * 2))   // Result.fail(err)
   */
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this._isSuccess) {
      return fn(this._value as T);
    }
    return Result.fail(this._error as E);
  }

  /**
   * Returns the success value if present, otherwise returns the default.
   *
   * @param defaultValue - The fallback value
   * @returns The success value or the default
   *
   * @example
   * Result.ok(42).getOrElse(0)       // 42
   * Result.fail(err).getOrElse(0)    // 0
   */
  getOrElse(defaultValue: T): T {
    return this._isSuccess ? (this._value as T) : defaultValue;
  }

  /**
   * Returns the success value or throws the contained error.
   * Useful when you know the result should be successful and want
   * to propagate the error as an exception (e.g., in tests).
   *
   * @returns The success value
   * @throws The contained error if the result is a failure
   *
   * @example
   * const value = result.getOrThrow(); // throws if failure
   */
  getOrThrow(): T {
    if (this._isSuccess) {
      return this._value as T;
    }
    throw this._error;
  }
}
```

---

## 6. Domain Events

Domain events represent meaningful occurrences in the business domain. They are collected by entities during state changes and published by the application layer after successful persistence.

### 6.1 Base DomainEvent

**File**: `src/domain/events/domain-event.ts`

```typescript
// src/domain/events/domain-event.ts

/**
 * Base class for all domain events.
 *
 * Domain events capture something important that happened in the domain.
 * They are collected by entities (see Wallet.pullDomainEvents()) and
 * published by the application layer (via EventEmitter2) after the
 * aggregate has been persisted.
 *
 * Each event carries:
 * - eventName: Used as the EventEmitter2 event key (e.g., 'transaction.processed')
 * - occurredAt: When the event happened
 * - aggregateId: The ID of the aggregate root that produced the event
 */
export abstract class DomainEvent {
  /** When this event occurred. */
  public readonly occurredAt: Date;

  /**
   * @param eventName - The event name used as the EventEmitter2 event key
   * @param aggregateId - The ID of the aggregate root that produced this event
   */
  protected constructor(
    public readonly eventName: string,
    public readonly aggregateId: string,
  ) {
    this.occurredAt = new Date();
  }
}
```

### 6.2 TransactionProcessedEvent

**File**: `src/domain/events/transaction-processed.event.ts`

```typescript
// src/domain/events/transaction-processed.event.ts

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
```

### 6.3 FraudAlertCreatedEvent

**File**: `src/domain/events/fraud-alert-created.event.ts`

```typescript
// src/domain/events/fraud-alert-created.event.ts

import { DomainEvent } from './domain-event';
import { FraudAlertType, FraudAlertSeverity } from '../entities/fraud-alert.entity';

/**
 * Event emitted when a new fraud alert has been created and persisted.
 *
 * Published after the alert is saved to the database.
 * Can be consumed by notification handlers, monitoring systems, etc.
 */
export class FraudAlertCreatedEvent extends DomainEvent {
  /**
   * @param alertId - The unique alert ID
   * @param transactionId - The transaction that triggered the alert
   * @param userId - The user associated with the alert
   * @param alertType - The type of fraud detected
   * @param severity - The severity level of the alert
   */
  constructor(
    public readonly alertId: string,
    public readonly transactionId: string,
    public readonly userId: string,
    public readonly alertType: FraudAlertType,
    public readonly severity: FraudAlertSeverity,
  ) {
    super('fraud.alert.created', alertId);
  }
}
```

### 6.4 Domain Events Index

**File**: `src/domain/events/index.ts`

```typescript
// src/domain/events/index.ts

export { DomainEvent } from './domain-event';
export { TransactionProcessedEvent } from './transaction-processed.event';
export { FraudAlertCreatedEvent } from './fraud-alert-created.event';
```

---

## 7. Repository Interfaces (Ports)

Repository interfaces define the persistence contract that the domain expects. They live in the domain layer but are implemented in the infrastructure layer. The application layer accesses them through NestJS dependency injection using centralized string tokens.

### 7.1 IWalletRepository

**File**: `src/domain/interfaces/wallet-repository.interface.ts`

```typescript
// src/domain/interfaces/wallet-repository.interface.ts

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
```

### 7.2 ITransactionRepository

**File**: `src/domain/interfaces/transaction-repository.interface.ts`

```typescript
// src/domain/interfaces/transaction-repository.interface.ts

import { Transaction } from '../entities/transaction.entity';

/**
 * Port for transaction persistence operations.
 *
 * Implemented by PrismaTransactionRepository in the infrastructure layer.
 * Injected into use cases via INJECTION_TOKENS.TRANSACTION_REPOSITORY.
 */
export interface ITransactionRepository {
  /**
   * Persists a transaction.
   * The transaction_id serves as the idempotency key and must be unique.
   *
   * @param transaction - The transaction entity to persist
   * @throws DuplicateTransactionError if the idempotency key already exists
   */
  save(transaction: Transaction): Promise<void>;

  /**
   * Finds all transactions for a user, ordered by creation time descending.
   *
   * @param userId - The user's UUID
   * @returns Array of transactions (newest first)
   */
  findByUserId(userId: string): Promise<Transaction[]>;

  /**
   * Finds a transaction by its idempotency key (transaction_id from API).
   * Used for idempotency checking before processing a new transaction.
   *
   * @param transactionId - The client-provided transaction ID
   * @returns The transaction if found, null otherwise
   */
  findByIdempotencyKey(transactionId: string): Promise<Transaction | null>;

  /**
   * Counts transactions for a user within a time window.
   * Used by fraud detection for velocity checks.
   *
   * @param userId - The user's UUID
   * @param windowStart - The start of the time window
   * @returns The number of transactions in the window
   */
  countByUserIdInWindow(userId: string, windowStart: Date): Promise<number>;
}
```

### 7.3 IFraudAlertRepository

**File**: `src/domain/interfaces/fraud-alert-repository.interface.ts`

```typescript
// src/domain/interfaces/fraud-alert-repository.interface.ts

import { FraudAlert } from '../entities/fraud-alert.entity';

/**
 * Port for fraud alert persistence operations.
 *
 * Implemented by PrismaFraudAlertRepository in the infrastructure layer.
 * Injected into use cases via INJECTION_TOKENS.FRAUD_ALERT_REPOSITORY.
 */
export interface IFraudAlertRepository {
  /**
   * Persists a fraud alert.
   *
   * @param alert - The fraud alert entity to persist
   */
  save(alert: FraudAlert): Promise<void>;

  /**
   * Finds all fraud alerts, optionally filtered by resolved status.
   * Returns results ordered by creation time descending (newest first).
   *
   * @param options - Optional filter: { resolved: true } for resolved only,
   *                  { resolved: false } for unresolved only, or omit for all
   * @returns Array of fraud alerts
   */
  findAll(options?: { resolved?: boolean }): Promise<FraudAlert[]>;

  /**
   * Finds all fraud alerts for a specific user.
   * Returns results ordered by creation time descending.
   *
   * @param userId - The user's UUID
   * @returns Array of fraud alerts for the user
   */
  findByUserId(userId: string): Promise<FraudAlert[]>;

  /**
   * Finds a fraud alert by its ID.
   *
   * @param id - The alert's UUID
   * @returns The fraud alert if found, null otherwise
   */
  findById(id: string): Promise<FraudAlert | null>;
}
```

### 7.4 Injection Tokens

**File**: `src/domain/interfaces/injection-tokens.ts`

```typescript
// src/domain/interfaces/injection-tokens.ts

/**
 * Centralized dependency injection tokens.
 *
 * These string constants are used as NestJS DI tokens to bind domain
 * interfaces to their infrastructure implementations. Using constants
 * instead of magic strings prevents typos and enables refactoring.
 *
 * Usage in modules (infrastructure layer):
 *   { provide: INJECTION_TOKENS.WALLET_REPOSITORY, useClass: PrismaWalletRepository }
 *
 * Usage in use cases (application layer):
 *   @Inject(INJECTION_TOKENS.WALLET_REPOSITORY)
 *   private readonly walletRepository: IWalletRepository
 *
 * NOTE: This file contains only string constants and has zero framework
 * dependencies. It lives in the domain layer despite being consumed by
 * framework-aware layers.
 */
export const INJECTION_TOKENS = {
  /** Token for IWalletRepository implementations. */
  WALLET_REPOSITORY: 'IWalletRepository',

  /** Token for ITransactionRepository implementations. */
  TRANSACTION_REPOSITORY: 'ITransactionRepository',

  /** Token for IFraudAlertRepository implementations. */
  FRAUD_ALERT_REPOSITORY: 'IFraudAlertRepository',

  /** Token for FraudDetectionService (domain service). */
  FRAUD_DETECTION_SERVICE: 'IFraudDetectionService',

  /** Token for fraud detection configuration. */
  FRAUD_CONFIG: 'FRAUD_CONFIG',

  /** Token for the event publisher abstraction. */
  EVENT_PUBLISHER: 'IEventPublisher',
} as const;
```

### 7.5 Repository Interfaces Index

**File**: `src/domain/interfaces/index.ts`

```typescript
// src/domain/interfaces/index.ts

export { IWalletRepository } from './wallet-repository.interface';
export { ITransactionRepository } from './transaction-repository.interface';
export { IFraudAlertRepository } from './fraud-alert-repository.interface';
export { INJECTION_TOKENS } from './injection-tokens';
```

---

## 8. Domain Services

### 8.1 FraudDetectionService

**File**: `src/domain/services/fraud-detection.service.ts`

The FraudDetectionService is a **pure domain service** with zero framework dependencies. It contains the fraud analysis business logic: amount threshold checks and velocity checks. The application layer wraps this service, providing it with the required configuration and recent transaction data.

```typescript
// src/domain/services/fraud-detection.service.ts

import { FraudAlert, FraudAlertType, FraudAlertSeverity } from '../entities/fraud-alert.entity';
import { Transaction } from '../entities/transaction.entity';

/**
 * Configuration for the fraud detection rules.
 * Values come from environment variables via the application layer.
 */
export interface FraudConfig {
  /** The monetary threshold above which a transaction is flagged (decimal). Default: 10,000. */
  amountThreshold: number;

  /** The time window in minutes for velocity checks. Default: 5. */
  velocityWindowMinutes: number;

  /** Max transactions allowed in the velocity window. Default: 10. */
  velocityMaxTransactions: number;
}

/**
 * Result of a fraud analysis. Contains zero or more alerts.
 */
export class FraudAnalysisResult {
  constructor(
    /** The alerts generated by the analysis. Empty array if no fraud detected. */
    public readonly alerts: FraudAlert[],
  ) {}

  /**
   * Returns true if the analysis generated any alerts.
   */
  hasAlerts(): boolean {
    return this.alerts.length > 0;
  }

  /**
   * Returns the highest severity across all alerts, or null if no alerts.
   */
  highestSeverity(): FraudAlertSeverity | null {
    if (this.alerts.length === 0) return null;

    const severityOrder: Record<FraudAlertSeverity, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };

    return this.alerts.reduce<FraudAlertSeverity>((highest, alert) => {
      return severityOrder[alert.severity] > severityOrder[highest]
        ? alert.severity
        : highest;
    }, this.alerts[0].severity);
  }
}

/**
 * Pure domain service for fraud detection.
 *
 * Analyzes a transaction against configurable fraud rules:
 * 1. Amount threshold: flags transactions exceeding a configured amount.
 * 2. Velocity check: flags users making too many transactions in a time window.
 *
 * This service has ZERO framework dependencies. It receives its configuration
 * through the constructor and operates on domain entities directly.
 *
 * The application layer is responsible for:
 * - Providing the FraudConfig (from environment variables)
 * - Fetching recent transactions from the repository
 * - Persisting any generated FraudAlert entities
 * - Publishing FraudAlertCreatedEvent domain events
 *
 * @example
 * const service = new FraudDetectionService(config);
 * const result = service.analyze(transaction, recentTransactions);
 * if (result.hasAlerts()) {
 *   for (const alert of result.alerts) {
 *     await alertRepository.save(alert);
 *   }
 * }
 */
export class FraudDetectionService {
  constructor(private readonly config: FraudConfig) {}

  /**
   * Analyzes a transaction for potential fraud patterns.
   *
   * Checks both amount threshold and velocity rules. Each rule
   * independently determines whether to generate an alert and at
   * what severity level.
   *
   * @param transaction - The transaction to analyze
   * @param recentTransactions - Recent transactions for the same user
   *                             (used for velocity calculation)
   * @returns FraudAnalysisResult containing zero or more FraudAlert entities
   */
  analyze(
    transaction: Transaction,
    recentTransactions: Transaction[],
  ): FraudAnalysisResult {
    const alerts: FraudAlert[] = [];

    // Rule 1: Amount threshold check
    const amountAlert = this.checkAmountThreshold(transaction);
    if (amountAlert !== null) {
      alerts.push(amountAlert);
    }

    // Rule 2: Velocity check
    const velocityAlert = this.checkVelocity(transaction, recentTransactions);
    if (velocityAlert !== null) {
      alerts.push(velocityAlert);
    }

    return new FraudAnalysisResult(alerts);
  }

  /**
   * Checks if the transaction amount exceeds the configured threshold.
   *
   * Severity tiers for HIGH_AMOUNT alerts:
   *   - LOW:    amount > threshold AND amount < 2x threshold
   *   - MEDIUM: amount >= 2x threshold AND amount < 5x threshold
   *   - HIGH:   amount >= 5x threshold
   *
   * @param transaction - The transaction to check
   * @returns A FraudAlert if the threshold is exceeded, null otherwise
   */
  private checkAmountThreshold(transaction: Transaction): FraudAlert | null {
    const amount = transaction.amount.value;
    const threshold = this.config.amountThreshold;

    if (amount <= threshold) {
      return null;
    }

    const severity = FraudAlert.calculateAmountSeverity(amount, threshold);

    return FraudAlert.create({
      transactionId: transaction.id,
      userId: transaction.userId,
      alertType: 'HIGH_AMOUNT',
      severity,
      details: {
        amount,
        threshold,
        ratio: Math.round((amount / threshold) * 100) / 100,
      },
    });
  }

  /**
   * Checks if the user's transaction velocity exceeds the configured limit.
   *
   * Counts the number of recent transactions within the configured time window
   * and compares against the maximum. The current transaction being analyzed
   * is included in the count (count = recentTransactions + 1).
   *
   * Severity tiers for VELOCITY alerts:
   *   - MEDIUM:   count > max
   *   - HIGH:     count > 2x max
   *   - CRITICAL: count > 5x max
   *
   * @param transaction - The current transaction being analyzed
   * @param recentTransactions - Transactions for the same user in the time window
   * @returns A FraudAlert if velocity is exceeded, null otherwise
   */
  private checkVelocity(
    transaction: Transaction,
    recentTransactions: Transaction[],
  ): FraudAlert | null {
    const windowMs = this.config.velocityWindowMinutes * 60 * 1000;
    const windowStart = new Date(transaction.createdAt.getTime() - windowMs);

    const transactionsInWindow = recentTransactions.filter(
      (t) => t.createdAt.getTime() >= windowStart.getTime(),
    );

    // Include the current transaction in the count
    const totalCount = transactionsInWindow.length + 1;
    const maxTransactions = this.config.velocityMaxTransactions;

    if (totalCount <= maxTransactions) {
      return null;
    }

    const severity = FraudAlert.calculateVelocitySeverity(totalCount, maxTransactions);

    return FraudAlert.create({
      transactionId: transaction.id,
      userId: transaction.userId,
      alertType: 'VELOCITY',
      severity,
      details: {
        transactionCount: totalCount,
        maxTransactions,
        windowMinutes: this.config.velocityWindowMinutes,
        ratio: Math.round((totalCount / maxTransactions) * 100) / 100,
      },
    });
  }
}
```

---

## 9. File Structure

Complete file tree for `src/domain/` with descriptions of every file:

```
src/domain/
│
├── common/
│   └── result.ts                          # Result<T, E> discriminated union for
│                                          # explicit success/failure handling.
│                                          # Methods: ok(), fail(), map(), flatMap(),
│                                          # getOrElse(), getOrThrow()
│
├── entities/
│   ├── wallet.entity.ts                   # Wallet aggregate root. Manages balance,
│   │                                      # deposit/withdraw operations, domain event
│   │                                      # collection. Factory: create(), reconstitute()
│   │
│   ├── transaction.entity.ts              # Immutable transaction record. Created by
│   │                                      # Wallet.deposit() and Wallet.withdraw().
│   │                                      # Factory: createDeposit(), createWithdraw(),
│   │                                      # reconstitute()
│   │
│   └── fraud-alert.entity.ts             # Fraud alert with lifecycle (unresolved ->
│                                          # resolved). Static severity calculation
│                                          # methods. Factory: create(), reconstitute()
│                                          # Also exports FraudAlertType and
│                                          # FraudAlertSeverity types.
│
├── value-objects/
│   ├── money.vo.ts                        # Money value object. Stores as integer cents.
│   │                                      # Factory: of(), fromCents(), zero()
│   │                                      # Operations: add(), subtract(), multiply()
│   │                                      # Comparisons: isLessThan(), isGreaterThan(),
│   │                                      # isNegativeOrZero(), equals()
│   │                                      # Properties: value (decimal), cents (integer)
│   │
│   ├── transaction-type.vo.ts             # Enum-like value object for DEPOSIT/WITHDRAW.
│   │                                      # Singleton instances: DEPOSIT, WITHDRAW
│   │                                      # Factory: fromString()
│   │                                      # Helpers: isDeposit(), isWithdraw()
│   │
│   ├── transaction-id.vo.ts              # UUID v4 wrapper for transaction identifiers.
│   │                                      # Factory: generate(), fromString()
│   │                                      # Validates UUID v4 format.
│   │
│   └── user-id.vo.ts                     # UUID v4 wrapper for user identifiers.
│                                          # Factory: generate(), fromString()
│                                          # Validates UUID v4 format.
│
├── errors/
│   ├── domain-error.ts                    # Abstract base class for all domain errors.
│   │                                      # Provides abstract 'code' property for
│   │                                      # programmatic identification.
│   │
│   ├── insufficient-balance.error.ts      # Withdrawal exceeds balance. Carries
│   │                                      # currentBalance and requestedAmount.
│   │                                      # Code: INSUFFICIENT_BALANCE
│   │
│   ├── invalid-amount.error.ts            # Invalid monetary amount (negative, zero,
│   │                                      # too many decimals). Carries reason string.
│   │                                      # Code: INVALID_AMOUNT
│   │
│   ├── wallet-not-found.error.ts          # No wallet found for user ID.
│   │                                      # Code: WALLET_NOT_FOUND
│   │
│   ├── wallet-already-exists.error.ts     # Wallet already exists for user.
│   │                                      # Code: WALLET_ALREADY_EXISTS
│   │
│   ├── transaction-not-found.error.ts     # Transaction not found by ID.
│   │                                      # Code: TRANSACTION_NOT_FOUND
│   │
│   ├── alert-not-found.error.ts           # Fraud alert not found by ID.
│   │                                      # Code: ALERT_NOT_FOUND
│   │
│   ├── alert-already-resolved.error.ts    # Fraud alert already resolved.
│   │                                      # Code: ALERT_ALREADY_RESOLVED
│   │
│   ├── duplicate-transaction.error.ts     # Duplicate idempotency key.
│   │                                      # Code: DUPLICATE_TRANSACTION
│   │
│   └── index.ts                           # Barrel export for all domain errors.
│
├── events/
│   ├── domain-event.ts                    # Abstract base class for domain events.
│   │                                      # Properties: eventName, occurredAt,
│   │                                      # aggregateId
│   │
│   ├── transaction-processed.event.ts     # Emitted after deposit/withdrawal.
│   │                                      # eventName: 'transaction.processed'
│   │                                      # Carries: transactionId, walletId, userId,
│   │                                      # type, amount, balanceAfter, timestamp
│   │
│   ├── fraud-alert-created.event.ts       # Emitted when a fraud alert is persisted.
│   │                                      # eventName: 'fraud.alert.created'
│   │                                      # Carries: alertId, transactionId, userId,
│   │                                      # alertType, severity
│   │
│   └── index.ts                           # Barrel export for all domain events.
│
├── interfaces/
│   ├── wallet-repository.interface.ts     # IWalletRepository port.
│   │                                      # Methods: findByUserId(),
│   │                                      # findByUserIdWithLock(), save()
│   │
│   ├── transaction-repository.interface.ts # ITransactionRepository port.
│   │                                      # Methods: save(), findByUserId(),
│   │                                      # findByIdempotencyKey(),
│   │                                      # countByUserIdInWindow()
│   │
│   ├── fraud-alert-repository.interface.ts # IFraudAlertRepository port.
│   │                                      # Methods: save(), findAll(),
│   │                                      # findByUserId(), findById()
│   │
│   ├── injection-tokens.ts               # INJECTION_TOKENS constant object.
│   │                                      # String tokens for NestJS DI binding.
│   │                                      # Zero framework dependencies.
│   │
│   └── index.ts                           # Barrel export for all interfaces
│                                          # and injection tokens.
│
└── services/
    └── fraud-detection.service.ts         # Pure domain service for fraud analysis.
                                           # Constructor: FraudConfig
                                           # Method: analyze(transaction, recentTxs)
                                           # Returns: FraudAnalysisResult
                                           # Checks: amount threshold, velocity
                                           # Also exports: FraudConfig interface,
                                           # FraudAnalysisResult class
```

**Total files in `src/domain/`**: 21

---

## 10. Integration Notes

This section describes how the other layers should interact with the domain model.

### 10.1 How the Application Layer Should Use Domain Objects

The application layer orchestrates domain objects through use cases. Each use case follows this pattern:

```typescript
// PSEUDOCODE: ProcessTransactionUseCase.execute()

async execute(input: ProcessTransactionInput): Promise<ProcessTransactionOutput> {
  // 1. IDEMPOTENCY CHECK
  //    Look up the transaction_id (idempotency key) in the repository.
  //    If it already exists, return the cached result immediately.
  const existing = await this.transactionRepository.findByIdempotencyKey(input.transactionId);
  if (existing) {
    return this.toOutput(existing);
  }

  // 2. PESSIMISTIC LOCK + WALLET LOOKUP
  //    Use findByUserIdWithLock() inside a database transaction to prevent
  //    concurrent modifications. If no wallet exists, create one.
  let wallet = await this.walletRepository.findByUserIdWithLock(input.userId);
  if (!wallet) {
    wallet = Wallet.create(input.userId);
  }

  // 3. DOMAIN OPERATION
  //    Call wallet.deposit() or wallet.withdraw(). These return Result<T, E>.
  const amount = Money.of(input.amount);
  const result = input.type === 'deposit'
    ? wallet.deposit(amount)
    : wallet.withdraw(amount);

  // 4. HANDLE DOMAIN FAILURE
  //    If the domain operation failed, translate the DomainError
  //    into an ApplicationException and throw it.
  if (result.isFailure) {
    throw ApplicationException.fromDomainError(result.error);
  }

  const transaction = result.value;

  // 5. PERSIST (atomic: wallet + transaction in same DB transaction)
  await this.walletRepository.save(wallet);
  await this.transactionRepository.save(transaction);

  // 6. FRAUD DETECTION (sync, within the same request)
  //    Fetch recent transactions and run the domain service analysis.
  const windowStart = new Date(Date.now() - this.fraudConfig.velocityWindowMinutes * 60 * 1000);
  const recentTxCount = await this.transactionRepository.countByUserIdInWindow(
    input.userId,
    windowStart,
  );
  const recentTxs = await this.transactionRepository.findByUserId(input.userId);
  const fraudResult = this.fraudDetectionService.analyze(transaction, recentTxs);

  if (fraudResult.hasAlerts()) {
    for (const alert of fraudResult.alerts) {
      await this.fraudAlertRepository.save(alert);
    }
  }

  // 7. PUBLISH DOMAIN EVENTS
  //    Pull events from the wallet (collected during deposit/withdraw)
  //    and publish via EventEmitter2.
  const domainEvents = wallet.pullDomainEvents();
  for (const event of domainEvents) {
    this.eventEmitter.emit(event.eventName, event);
  }

  // Publish fraud alert events
  if (fraudResult.hasAlerts()) {
    for (const alert of fraudResult.alerts) {
      this.eventEmitter.emit(
        'fraud.alert.created',
        new FraudAlertCreatedEvent(
          alert.id,
          alert.transactionId,
          alert.userId,
          alert.alertType,
          alert.severity,
        ),
      );
    }
  }

  // 8. RETURN OUTPUT DTO
  return {
    transactionId: transaction.id,
    type: transaction.type.value.toLowerCase(),
    amount: transaction.amount.value,
    balanceAfter: transaction.balanceAfter.value,
    timestamp: transaction.createdAt.toISOString(),
  };
}
```

**Key rules for the application layer**:

- Always check idempotency FIRST, before acquiring any locks.
- Always use `findByUserIdWithLock()` for write operations to prevent race conditions.
- Always translate `Result.fail()` into `ApplicationException` at this boundary.
- Always persist BEFORE publishing domain events (events represent committed state).
- Never import anything from `@prisma/client`. Use only domain interfaces.
- Use `@Inject(INJECTION_TOKENS.WALLET_REPOSITORY)` for dependency injection.

### 10.2 How the Infrastructure Layer Should Implement Repository Interfaces

The infrastructure layer implements each `I*Repository` interface with Prisma. Key patterns:

**Mapping to/from domain entities**:

```typescript
// PSEUDOCODE: PrismaWalletRepository

// Domain -> Persistence (for save)
private toPersistence(wallet: Wallet): PrismaWalletCreateInput {
  return {
    id: wallet.id,
    userId: wallet.userId,
    balance: wallet.balance.cents,    // Store as integer cents in DB
    version: wallet.version,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}

// Persistence -> Domain (for reads)
private toDomain(record: PrismaWalletRecord): Wallet {
  return Wallet.reconstitute({
    id: record.id,
    userId: record.userId,
    balance: Money.fromCents(record.balance),  // Reconstruct from cents
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
```

**Pessimistic locking with `SELECT ... FOR UPDATE`**:

```typescript
// PSEUDOCODE: findByUserIdWithLock implementation

async findByUserIdWithLock(userId: string): Promise<Wallet | null> {
  const [record] = await this.prisma.$queryRaw<WalletRecord[]>`
    SELECT id, user_id, balance, version, created_at, updated_at
    FROM wallets
    WHERE user_id = ${userId}
    FOR UPDATE
  `;

  if (!record) return null;

  return Wallet.reconstitute({
    id: record.id,
    userId: record.user_id,
    balance: Money.fromCents(record.balance),
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  });
}
```

**Upsert pattern for wallet save**:

```typescript
// PSEUDOCODE: save implementation with upsert

async save(wallet: Wallet): Promise<void> {
  await this.prisma.wallet.upsert({
    where: { id: wallet.id },
    create: {
      id: wallet.id,
      userId: wallet.userId,
      balance: wallet.balance.cents,
      version: 1,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    },
    update: {
      balance: wallet.balance.cents,
      updatedAt: wallet.updatedAt,
      version: { increment: 1 },
    },
  });
}
```

**Key rules for the infrastructure layer**:

- Always use `Wallet.reconstitute()` and `Transaction.reconstitute()` when reading from DB (never `create()`).
- Store money as integer cents in the database (`Int` column in Prisma, not `Decimal`).
- Use `$queryRaw` with parameterized queries for `FOR UPDATE` locks (Prisma does not support `FOR UPDATE` natively).
- All repository implementations MUST be decorated with `@Injectable()` and registered in the infrastructure module.
- Map between snake_case DB columns and camelCase domain properties in the toDomain/toPersistence methods.

### 10.3 Event Publishing Flow

The complete flow from domain event creation to publication:

```
1. ENTITY COLLECTS EVENT
   wallet.deposit(amount)
     └── internally calls: this.addDomainEvent(new TransactionProcessedEvent(...))
     └── event is stored in wallet._domainEvents[]

2. USE CASE PERSISTS STATE
   await walletRepository.save(wallet);
   await transactionRepository.save(transaction);
   // At this point, the state is committed to the database.

3. USE CASE PUBLISHES EVENTS
   const events = wallet.pullDomainEvents();   // Drains the events list
   for (const event of events) {
     eventEmitter.emit(event.eventName, event); // 'transaction.processed'
   }
   // Events are only published AFTER successful persistence.
   // If persistence fails, events are never published.

4. EVENT HANDLERS REACT
   @OnEvent('transaction.processed')
   async handleTransactionProcessed(event: TransactionProcessedEvent) {
     // FraudCheckHandler: run fraud analysis
     // AuditLogHandler: log the transaction
   }
```

**Why this order matters**:

- If we published events BEFORE persistence and the DB write failed, we would have emitted events for state that does not exist -- violating consistency.
- By publishing AFTER persistence, every event corresponds to committed state.
- If event publishing fails (unlikely with in-process EventEmitter2), the state is still persisted. The worst case is a missed side effect, not data corruption.

### 10.4 Pessimistic Locking Flow for ProcessTransaction

The complete concurrency control flow:

```
Request A (withdraw $80)          Request B (withdraw $80)
         │                                  │
         ▼                                  ▼
   Idempotency check                  Idempotency check
   (no duplicate found)               (no duplicate found)
         │                                  │
         ▼                                  ▼
   BEGIN TRANSACTION                  BEGIN TRANSACTION
         │                                  │
         ▼                                  ▼
   SELECT ... FROM wallets            SELECT ... FROM wallets
   WHERE user_id = $1                 WHERE user_id = $1
   FOR UPDATE                         FOR UPDATE
         │                                  │
         │  (acquires row lock)             │  (BLOCKS - waiting for A's lock)
         │                                  │
         ▼                                  │
   wallet.withdraw($80)                    │
   balance: $100 -> $20                    │
         │                                  │
         ▼                                  │
   walletRepo.save(wallet)                 │
   transactionRepo.save(tx)               │
         │                                  │
         ▼                                  │
   COMMIT TRANSACTION                      │
   (releases lock)                          │
         │                                  ▼
         │                            (lock acquired, reads COMMITTED balance)
         │                            wallet.balance = $20
         │                                  │
         │                                  ▼
         │                            wallet.withdraw($80)
         │                            $20 < $80 -> InsufficientBalanceError!
         │                                  │
         │                                  ▼
         │                            ROLLBACK TRANSACTION
         │                            Return 422 Insufficient Balance
         ▼
   Return 201 (success)
```

**Why pessimistic locking over optimistic locking**:

1. The executive summary recommends pessimistic locking (`SELECT ... FOR UPDATE`) for strong consistency in financial operations at 1,000 TPS.
2. PostgreSQL handles row-level locks efficiently at this scale.
3. Pessimistic locking guarantees correctness on the first attempt, while optimistic locking requires retries.
4. For a financial system where balance integrity is critical, pessimistic locking is the safer choice.

**Implementation note**: The `findByUserIdWithLock()` call and subsequent `save()` MUST execute within the same database transaction. The infrastructure layer wraps these in `prisma.$transaction()`. The application layer (use case) coordinates this by calling repository methods within a transactional context provided by the infrastructure layer.

---

## Appendix: Design Decision Summary

| Decision | Choice | Source |
|----------|--------|--------|
| Money storage | Integer cents (`_cents: number`) | Research 01, Executive Summary |
| Error handling (domain) | `Result<T, E>` pattern, no throwing | Research 01, Architecture spec |
| Error handling (application) | Throw `ApplicationException` | Architecture spec |
| Error handling (presentation) | `GlobalExceptionFilter` | Architecture spec |
| Concurrency | Pessimistic locking (`SELECT ... FOR UPDATE`) | Executive Summary, Security Research |
| Idempotency | Client-provided `transaction_id` as idempotency key | Requirements, Research 01 |
| Domain events | Collect in entity, publish after persistence | Research 01, Executive Summary |
| DI tokens | Centralized `INJECTION_TOKENS` constants | Research 01 |
| Domain purity | Zero framework dependencies (no `@Injectable`, no NestJS, no Prisma) | Architecture spec, Research 01 |
| Entity creation | Private constructor + static `create()` and `reconstitute()` | Research 01 |
| Fraud severity (amount) | LOW (<2x), MEDIUM (<5x), HIGH (>=5x) threshold | Fraud requirements |
| Fraud severity (velocity) | MEDIUM (>max), HIGH (>2x max), CRITICAL (>5x max) | Fraud requirements |
| Wallet as aggregate root | Wallet creates Transactions as side effects of deposit/withdraw | Architecture spec |
