# Architecture Patterns Research: NestJS + Clean Architecture for Financial Transactions

**Research Agent**: architecture-researcher
**Date**: 2026-02-20
**Scope**: NestJS Clean Architecture patterns for the Refacil Wallet microservice
**Tech Stack**: Node.js 20, TypeScript 5.3+, NestJS 10, PostgreSQL 16, Prisma ORM 5.x

---

## Table of Contents

1. [Layer Separation in NestJS Clean Architecture](#1-layer-separation-in-nestjs-clean-architecture)
2. [Dependency Injection Patterns in NestJS](#2-dependency-injection-patterns-in-nestjs)
3. [Error Handling Strategies](#3-error-handling-strategies)
4. [Repository Pattern with Prisma](#4-repository-pattern-with-prisma)
5. [Recommendations for This Project](#5-recommendations-for-this-project)

---

## 1. Layer Separation in NestJS Clean Architecture

### Overview

Clean Architecture (also called Hexagonal or Ports & Adapters) organizes code into concentric layers with a strict dependency rule: **dependencies only point inward**. The innermost domain layer has zero external dependencies, while outer layers depend on inner layers through abstractions.

For a financial microservice, this separation is critical. Business rules around balance validation, transaction limits, and fraud detection must be testable and portable without any coupling to NestJS, Prisma, or HTTP concerns.

```
Presentation (Controllers, Filters)
    ↓
Application (Use Cases, DTOs)
    ↓
Domain (Entities, Value Objects, Repository Interfaces)

Infrastructure (Prisma Repos, External Services) → implements Domain interfaces
```

### 1.1 Domain Layer: Framework-Free Business Rules

The domain layer contains entities, value objects, domain services, domain events, and repository interface definitions (ports). It must have **zero imports from NestJS, Prisma, or any framework**. This means:

- No `@Injectable()` decorators on domain classes
- No imports from `@nestjs/*` packages
- No imports from `@prisma/client`
- Only pure TypeScript, potentially importing lightweight utility libraries (e.g., `uuid`)

#### Domain Entity Example

```typescript
// src/domain/entities/wallet.entity.ts

import { Money } from '../value-objects/money.value-object';
import { Result } from '../common/result';
import { InsufficientFundsError } from '../errors/insufficient-funds.error';
import { WalletCreatedEvent } from '../events/wallet-created.event';
import { DomainEvent } from '../events/domain-event';

export class Wallet {
  private _domainEvents: DomainEvent[] = [];

  private constructor(
    private readonly _id: string,
    private readonly _userId: string,
    private _balance: Money,
    private readonly _currency: string,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
    private _version: number,
  ) {}

  // Factory method - the only way to create a new wallet
  static create(userId: string, currency: string): Wallet {
    const wallet = new Wallet(
      crypto.randomUUID(),
      userId,
      Money.zero(currency),
      currency,
      new Date(),
      new Date(),
      1,
    );
    wallet.addDomainEvent(new WalletCreatedEvent(wallet.id, userId, currency));
    return wallet;
  }

  // Reconstitute from persistence - no events, no validation
  static reconstitute(props: {
    id: string;
    userId: string;
    balance: number;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
  }): Wallet {
    return new Wallet(
      props.id,
      props.userId,
      Money.of(props.balance, props.currency),
      props.currency,
      props.createdAt,
      props.updatedAt,
      props.version,
    );
  }

  /** Credit funds to the wallet. */
  credit(amount: Money): Result<void, Error> {
    if (amount.isNegativeOrZero()) {
      return Result.fail(new Error('Credit amount must be positive'));
    }
    if (!amount.hasSameCurrency(this._balance)) {
      return Result.fail(new Error('Currency mismatch'));
    }
    this._balance = this._balance.add(amount);
    this._updatedAt = new Date();
    return Result.ok(undefined);
  }

  /** Debit funds from the wallet. */
  debit(amount: Money): Result<void, InsufficientFundsError | Error> {
    if (amount.isNegativeOrZero()) {
      return Result.fail(new Error('Debit amount must be positive'));
    }
    if (!amount.hasSameCurrency(this._balance)) {
      return Result.fail(new Error('Currency mismatch'));
    }
    if (this._balance.isLessThan(amount)) {
      return Result.fail(
        new InsufficientFundsError(this._userId, amount.value, this._balance.value),
      );
    }
    this._balance = this._balance.subtract(amount);
    this._updatedAt = new Date();
    return Result.ok(undefined);
  }

  get id(): string { return this._id; }
  get userId(): string { return this._userId; }
  get balance(): Money { return this._balance; }
  get currency(): string { return this._currency; }
  get version(): number { return this._version; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  get domainEvents(): ReadonlyArray<DomainEvent> {
    return [...this._domainEvents];
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }

  private addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }
}
```

Key observations:
- Private constructor forces creation through `create()` (new wallet) or `reconstitute()` (from DB).
- `credit()` and `debit()` return `Result<void, Error>` instead of throwing.
- Domain events are collected internally and published by the application layer after persistence.
- `_version` supports optimistic locking at the domain level.
- No framework decorators or imports.

#### Value Object Example

```typescript
// src/domain/value-objects/money.value-object.ts

export class Money {
  private constructor(
    private readonly _value: number,
    private readonly _currency: string,
  ) {
    // Store as integer cents to avoid floating-point issues
    if (!Number.isInteger(_value)) {
      throw new Error('Money value must be in integer cents');
    }
  }

  static of(cents: number, currency: string): Money {
    return new Money(cents, currency);
  }

  static zero(currency: string): Money {
    return new Money(0, currency);
  }

  static fromDecimal(amount: number, currency: string): Money {
    return new Money(Math.round(amount * 100), currency);
  }

  get value(): number { return this._value; }
  get currency(): string { return this._currency; }

  /** Returns the decimal representation (e.g., 1050 cents -> 10.50). */
  toDecimal(): number {
    return this._value / 100;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this._value + other._value, this._currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this._value - other._value, this._currency);
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._value < other._value;
  }

  isNegativeOrZero(): boolean {
    return this._value <= 0;
  }

  hasSameCurrency(other: Money): boolean {
    return this._currency === other._currency;
  }

  equals(other: Money): boolean {
    return this._value === other._value && this._currency === other._currency;
  }

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Cannot operate on different currencies: ${this._currency} vs ${other._currency}`,
      );
    }
  }
}
```

Key observations:
- Immutable: every operation returns a new `Money` instance.
- Stores amounts as integer cents to eliminate floating-point precision errors -- essential for financial services.
- `assertSameCurrency` prevents mixing currencies at the value object level.

#### Domain Repository Interface (Port)

```typescript
// src/domain/interfaces/wallet-repository.interface.ts

import { Wallet } from '../entities/wallet.entity';

export interface IWalletRepository {
  /** Find a wallet by its unique ID. */
  findById(id: string): Promise<Wallet | null>;

  /** Find a wallet by user ID. */
  findByUserId(userId: string): Promise<Wallet | null>;

  /** Persist a wallet. Uses optimistic locking via version field. */
  save(wallet: Wallet): Promise<Wallet>;

  /** Check if a wallet exists for a given user. */
  existsByUserId(userId: string): Promise<boolean>;
}
```

The interface lives in the domain layer. The infrastructure layer provides the Prisma-based implementation.

### 1.2 Application Layer: Use Case Orchestration

The application layer contains use cases (command/query handlers), DTOs, and application services. This is where NestJS enters the picture: use cases are decorated with `@Injectable()` and receive repository ports via constructor injection.

```typescript
// src/application/use-cases/process-transaction.use-case.ts

import { Injectable, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IWalletRepository } from '../../domain/interfaces/wallet-repository.interface';
import { ITransactionRepository } from '../../domain/interfaces/transaction-repository.interface';
import { Transaction } from '../../domain/entities/transaction.entity';
import { Money } from '../../domain/value-objects/money.value-object';
import { ProcessTransactionDto } from '../dtos/process-transaction.dto';
import { TransactionResponseDto } from '../dtos/transaction-response.dto';
import { ApplicationException } from '../exceptions/application.exception';

@Injectable()
export class ProcessTransactionUseCase {
  constructor(
    @Inject('IWalletRepository')
    private readonly walletRepository: IWalletRepository,
    @Inject('ITransactionRepository')
    private readonly transactionRepository: ITransactionRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Processes a financial transaction (deposit or withdrawal).
   * Enforces idempotency via the idempotency key.
   */
  async execute(dto: ProcessTransactionDto): Promise<TransactionResponseDto> {
    // 1. Idempotency check
    const existing = await this.transactionRepository.findByIdempotencyKey(
      dto.idempotencyKey,
    );
    if (existing) {
      return TransactionResponseDto.fromEntity(existing);
    }

    // 2. Find the wallet
    const wallet = await this.walletRepository.findByUserId(dto.userId);
    if (!wallet) {
      throw ApplicationException.notFound('Wallet', dto.userId);
    }

    // 3. Create the transaction entity (domain logic)
    const amount = Money.fromDecimal(dto.amount, wallet.currency);
    const transactionResult = Transaction.create({
      walletId: wallet.id,
      userId: dto.userId,
      type: dto.type,
      amount,
      description: dto.description,
      idempotencyKey: dto.idempotencyKey,
    });

    if (transactionResult.isFailure) {
      throw ApplicationException.badRequest(transactionResult.error.message);
    }

    const transaction = transactionResult.value;

    // 4. Apply to wallet (domain logic)
    const walletResult = dto.type === 'DEPOSIT'
      ? wallet.credit(amount)
      : wallet.debit(amount);

    if (walletResult.isFailure) {
      throw ApplicationException.fromDomainError(walletResult.error);
    }

    // 5. Persist (both in a DB transaction -- see repository section)
    const savedTransaction = await this.transactionRepository.saveWithWalletUpdate(
      transaction,
      wallet,
    );

    // 6. Publish domain events
    for (const event of wallet.domainEvents) {
      this.eventEmitter.emit(event.eventName, event);
    }
    wallet.clearDomainEvents();

    for (const event of transaction.domainEvents) {
      this.eventEmitter.emit(event.eventName, event);
    }
    transaction.clearDomainEvents();

    return TransactionResponseDto.fromEntity(savedTransaction);
  }
}
```

Key observations:
- The use case orchestrates: idempotency check, wallet lookup, domain operations, persistence, event publishing.
- Domain errors (returned as `Result.fail`) are translated into `ApplicationException` at this boundary.
- `@Inject('IWalletRepository')` uses a string token to resolve the port.
- Domain events are collected from entities and published after successful persistence.

### 1.3 Infrastructure Layer: Port Implementations (Adapters)

The infrastructure layer implements domain interfaces using concrete technologies. It depends inward on the domain layer (it imports domain interfaces and entities) but never the other way around.

```typescript
// src/infrastructure/repositories/prisma-wallet.repository.ts

import { Injectable } from '@nestjs/common';
import { IWalletRepository } from '../../domain/interfaces/wallet-repository.interface';
import { Wallet } from '../../domain/entities/wallet.entity';
import { PrismaService } from '../database/prisma.service';
import { OptimisticLockException } from '../../application/exceptions/optimistic-lock.exception';

@Injectable()
export class PrismaWalletRepository implements IWalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Wallet | null> {
    const record = await this.prisma.wallet.findUnique({ where: { id } });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    const record = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async save(wallet: Wallet): Promise<Wallet> {
    const record = await this.prisma.wallet.upsert({
      where: { id: wallet.id },
      create: {
        id: wallet.id,
        userId: wallet.userId,
        balance: wallet.balance.value,
        currency: wallet.currency,
        version: 1,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      },
      update: {
        balance: wallet.balance.value,
        updatedAt: wallet.updatedAt,
        version: { increment: 1 },
      },
    });
    return this.toDomain(record);
  }

  async existsByUserId(userId: string): Promise<boolean> {
    const count = await this.prisma.wallet.count({ where: { userId } });
    return count > 0;
  }

  /** Map a Prisma record back to a domain entity. */
  private toDomain(record: {
    id: string;
    userId: string;
    balance: number;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
  }): Wallet {
    return Wallet.reconstitute({
      id: record.id,
      userId: record.userId,
      balance: record.balance,
      currency: record.currency,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      version: record.version,
    });
  }
}
```

### 1.4 Presentation Layer: HTTP Concerns

The presentation layer handles HTTP request/response mapping, input validation (via `class-validator`), and error transformation.

```typescript
// src/presentation/controllers/transaction.controller.ts

import { Controller, Post, Body, Get, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProcessTransactionUseCase } from '../../application/use-cases/process-transaction.use-case';
import { ProcessTransactionDto } from '../../application/dtos/process-transaction.dto';
import { TransactionResponseDto } from '../../application/dtos/transaction-response.dto';

@ApiTags('Transactions')
@Controller('api/v1/transactions')
export class TransactionController {
  constructor(
    private readonly processTransactionUseCase: ProcessTransactionUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Process a financial transaction' })
  @ApiResponse({ status: 201, description: 'Transaction processed successfully' })
  @ApiResponse({ status: 409, description: 'Duplicate idempotency key (returns existing transaction)' })
  @ApiResponse({ status: 422, description: 'Insufficient funds or validation error' })
  async processTransaction(
    @Body() dto: ProcessTransactionDto,
  ): Promise<TransactionResponseDto> {
    return this.processTransactionUseCase.execute(dto);
  }
}
```

Key observations:
- The controller is thin: it delegates entirely to the use case.
- Swagger decorators document the API contract.
- HTTP status codes and response shapes are the controller's concern, not the domain's.

### 1.5 NestJS Module Organization

Each architectural layer maps to one or more NestJS modules. The key is controlling what each module exports and how providers are registered.

```typescript
// src/domain/domain.module.ts
// Note: Domain layer generally does not need a NestJS module since it has
// no injectable services. Domain entities and value objects are plain classes.
// However, if you have domain services that need DI, you can create one.

// src/infrastructure/infrastructure.module.ts
import { Module, Global } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { PrismaWalletRepository } from './repositories/prisma-wallet.repository';
import { PrismaTransactionRepository } from './repositories/prisma-transaction.repository';

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: 'IWalletRepository',
      useClass: PrismaWalletRepository,
    },
    {
      provide: 'ITransactionRepository',
      useClass: PrismaTransactionRepository,
    },
  ],
  exports: [
    PrismaService,
    'IWalletRepository',
    'ITransactionRepository',
  ],
})
export class InfrastructureModule {}

// src/application/application.module.ts
import { Module } from '@nestjs/common';
import { ProcessTransactionUseCase } from './use-cases/process-transaction.use-case';
import { GetBalanceUseCase } from './use-cases/get-balance.use-case';
import { GetTransactionHistoryUseCase } from './use-cases/get-transaction-history.use-case';

@Module({
  providers: [
    ProcessTransactionUseCase,
    GetBalanceUseCase,
    GetTransactionHistoryUseCase,
  ],
  exports: [
    ProcessTransactionUseCase,
    GetBalanceUseCase,
    GetTransactionHistoryUseCase,
  ],
})
export class ApplicationModule {}

// src/presentation/presentation.module.ts
import { Module } from '@nestjs/common';
import { ApplicationModule } from '../application/application.module';
import { TransactionController } from './controllers/transaction.controller';
import { WalletController } from './controllers/wallet.controller';
import { HealthController } from './controllers/health.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [
    TransactionController,
    WalletController,
    HealthController,
  ],
})
export class PresentationModule {}

// src/app.module.ts
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { PresentationModule } from './presentation/presentation.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    InfrastructureModule,
    PresentationModule,
  ],
})
export class AppModule {}
```

Key decisions:
- **InfrastructureModule is `@Global()`**: Repository bindings are available everywhere without explicit imports. This is acceptable because the infrastructure module binds to abstract tokens (`'IWalletRepository'`) that the application layer depends on.
- **ApplicationModule exports use cases**: The presentation module imports ApplicationModule to get access to use case providers.
- **No DomainModule**: Domain entities and value objects are plain classes that do not need NestJS DI. They are imported directly.
- **AppModule** is the composition root that wires everything together.

---

## 2. Dependency Injection Patterns in NestJS

### 2.1 Interface-Based Injection with String Tokens

TypeScript interfaces are erased at runtime, so NestJS cannot use them directly as injection tokens. The standard pattern uses string tokens (or Symbol tokens) combined with the `@Inject()` decorator.

```typescript
// Registration (in module):
{
  provide: 'IWalletRepository',
  useClass: PrismaWalletRepository,
}

// Consumption (in use case):
constructor(
  @Inject('IWalletRepository')
  private readonly walletRepository: IWalletRepository,
) {}
```

#### Centralized Token Constants

To avoid typos and enable refactoring, define tokens as constants:

```typescript
// src/domain/interfaces/injection-tokens.ts

export const INJECTION_TOKENS = {
  WALLET_REPOSITORY: 'IWalletRepository',
  TRANSACTION_REPOSITORY: 'ITransactionRepository',
  FRAUD_DETECTION_SERVICE: 'IFraudDetectionService',
  EVENT_PUBLISHER: 'IEventPublisher',
} as const;
```

Usage:

```typescript
import { INJECTION_TOKENS } from '../../domain/interfaces/injection-tokens';

// Registration
{
  provide: INJECTION_TOKENS.WALLET_REPOSITORY,
  useClass: PrismaWalletRepository,
}

// Consumption
constructor(
  @Inject(INJECTION_TOKENS.WALLET_REPOSITORY)
  private readonly walletRepository: IWalletRepository,
) {}
```

**Note on token file location**: Although `injection-tokens.ts` lives in the domain layer, it contains only string constants and no framework dependencies. Some teams place it in a shared `common/` folder instead. Either approach works as long as the domain layer remains free of framework imports.

### 2.2 Advanced Provider Patterns

#### Factory Providers

Useful when a provider depends on configuration or async initialization:

```typescript
// Factory provider for fraud detection configuration
{
  provide: 'FRAUD_CONFIG',
  useFactory: (configService: ConfigService) => ({
    velocityWindowMinutes: configService.get<number>('FRAUD_VELOCITY_WINDOW_MINUTES', 5),
    velocityMaxTransactions: configService.get<number>('FRAUD_VELOCITY_MAX_TRANSACTIONS', 10),
    amountThreshold: configService.get<number>('FRAUD_AMOUNT_THRESHOLD', 10000),
  }),
  inject: [ConfigService],
}
```

#### Async Factory Providers

For providers that require async initialization (e.g., establishing connections):

```typescript
{
  provide: 'INotificationService',
  useFactory: async (configService: ConfigService) => {
    const service = new SnsNotificationService(configService);
    await service.initialize();
    return service;
  },
  inject: [ConfigService],
}
```

### 2.3 Cross-Layer Dependency Resolution

The dependency resolution flow in NestJS modules mirrors Clean Architecture's dependency rule:

```
AppModule
├── InfrastructureModule (@Global)
│   └── Provides: 'IWalletRepository', 'ITransactionRepository', PrismaService
├── PresentationModule
│   └── Imports: ApplicationModule
│       └── Provides: ProcessTransactionUseCase, GetBalanceUseCase
│           └── @Inject('IWalletRepository') -- resolved from InfrastructureModule (global)
```

Because `InfrastructureModule` is global, its exports are available to all modules without explicit imports. The `ApplicationModule` does not need to import `InfrastructureModule` -- the global scope handles it.

If you prefer explicit dependencies over global modules (more verbose but more traceable):

```typescript
@Module({
  imports: [InfrastructureModule], // Explicit import instead of @Global
  providers: [ProcessTransactionUseCase],
  exports: [ProcessTransactionUseCase],
})
export class ApplicationModule {}
```

### 2.4 Testing Advantages of DI

The primary benefit of interface-based DI is testability. Use cases can be tested with in-memory fakes:

```typescript
// test/unit/process-transaction.use-case.spec.ts

describe('ProcessTransactionUseCase', () => {
  let useCase: ProcessTransactionUseCase;
  let walletRepository: IWalletRepository;
  let transactionRepository: ITransactionRepository;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProcessTransactionUseCase,
        {
          provide: 'IWalletRepository',
          useClass: InMemoryWalletRepository,
        },
        {
          provide: 'ITransactionRepository',
          useClass: InMemoryTransactionRepository,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    useCase = module.get(ProcessTransactionUseCase);
    walletRepository = module.get('IWalletRepository');
    transactionRepository = module.get('ITransactionRepository');
    eventEmitter = module.get(EventEmitter2);
  });

  it('should process a deposit', async () => {
    // Arrange: seed an in-memory wallet
    const wallet = Wallet.create('user-1', 'COP');
    await walletRepository.save(wallet);

    // Act
    const result = await useCase.execute({
      userId: 'user-1',
      type: 'DEPOSIT',
      amount: 50000,
      description: 'Test deposit',
      idempotencyKey: 'idempotency-123',
    });

    // Assert
    expect(result.type).toBe('DEPOSIT');
    expect(result.status).toBe('COMPLETED');

    const updatedWallet = await walletRepository.findByUserId('user-1');
    expect(updatedWallet.balance.toDecimal()).toBe(50000);
  });
});
```

The in-memory repository implements the same interface as the Prisma one:

```typescript
// test/fakes/in-memory-wallet.repository.ts

export class InMemoryWalletRepository implements IWalletRepository {
  private wallets: Map<string, Wallet> = new Map();

  async findById(id: string): Promise<Wallet | null> {
    return this.wallets.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    for (const wallet of this.wallets.values()) {
      if (wallet.userId === userId) return wallet;
    }
    return null;
  }

  async save(wallet: Wallet): Promise<Wallet> {
    this.wallets.set(wallet.id, wallet);
    return wallet;
  }

  async existsByUserId(userId: string): Promise<boolean> {
    for (const wallet of this.wallets.values()) {
      if (wallet.userId === userId) return true;
    }
    return false;
  }
}
```

---

## 3. Error Handling Strategies

### 3.1 Result<T, E> Pattern for the Domain Layer

The domain layer must never throw exceptions. Throwing breaks referential transparency and makes it impossible to reason about domain method behavior from the type signature alone. Instead, domain methods return a `Result<T, E>` discriminated union that explicitly signals success or failure.

#### Result Class Implementation

```typescript
// src/domain/common/result.ts

export class Result<T, E extends Error = Error> {
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  /** Create a success result. */
  static ok<T>(value: T): Result<T, never> {
    return new Result<T, never>(true, value, undefined);
  }

  /** Create a failure result. */
  static fail<E extends Error>(error: E): Result<never, E> {
    return new Result<never, E>(false, undefined, error);
  }

  get isSuccess(): boolean {
    return this._isSuccess;
  }

  get isFailure(): boolean {
    return !this._isSuccess;
  }

  /** Get the success value. Throws if result is a failure. */
  get value(): T {
    if (this._isSuccess) {
      return this._value as T;
    }
    throw new Error(
      `Cannot access value of a failed Result. Error: ${this._error?.message}`,
    );
  }

  /** Get the error. Throws if result is a success. */
  get error(): E {
    if (!this._isSuccess) {
      return this._error as E;
    }
    throw new Error('Cannot access error of a successful Result.');
  }

  /**
   * Transform the success value. If the result is a failure, the
   * mapper is not called and the error propagates.
   */
  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this._isSuccess) {
      return Result.ok(fn(this._value as T));
    }
    return Result.fail(this._error as E);
  }

  /**
   * Chain another Result-returning operation.
   * Enables: result.flatMap(value => anotherOperation(value))
   */
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this._isSuccess) {
      return fn(this._value as T);
    }
    return Result.fail(this._error as E);
  }

  /** Unwrap with a default value if failure. */
  getOrElse(defaultValue: T): T {
    return this._isSuccess ? (this._value as T) : defaultValue;
  }
}
```

#### Domain Methods Using Result

```typescript
// In Wallet entity:
debit(amount: Money): Result<void, InsufficientFundsError | Error> {
  if (amount.isNegativeOrZero()) {
    return Result.fail(new Error('Debit amount must be positive'));
  }
  if (this._balance.isLessThan(amount)) {
    return Result.fail(
      new InsufficientFundsError(this._userId, amount.value, this._balance.value),
    );
  }
  this._balance = this._balance.subtract(amount);
  return Result.ok(undefined);
}

// In Transaction entity factory:
static create(props: CreateTransactionProps): Result<Transaction, Error> {
  if (!props.idempotencyKey || props.idempotencyKey.trim().length === 0) {
    return Result.fail(new Error('Idempotency key is required'));
  }
  if (!['DEPOSIT', 'WITHDRAWAL'].includes(props.type)) {
    return Result.fail(new Error(`Invalid transaction type: ${props.type}`));
  }
  // ... create and return
  return Result.ok(transaction);
}
```

#### Custom Domain Errors

```typescript
// src/domain/errors/insufficient-funds.error.ts

export class InsufficientFundsError extends Error {
  public readonly code = 'INSUFFICIENT_FUNDS';

  constructor(
    public readonly userId: string,
    public readonly requestedAmount: number,
    public readonly availableBalance: number,
  ) {
    super(
      `Insufficient funds for user ${userId}: ` +
      `requested ${requestedAmount}, available ${availableBalance}`,
    );
    this.name = 'InsufficientFundsError';
  }
}

// src/domain/errors/wallet-not-found.error.ts

export class WalletNotFoundError extends Error {
  public readonly code = 'WALLET_NOT_FOUND';

  constructor(public readonly identifier: string) {
    super(`Wallet not found: ${identifier}`);
    this.name = 'WalletNotFoundError';
  }
}
```

### 3.2 ApplicationException for the Application Layer

The application layer translates domain errors into application-level exceptions that carry HTTP-compatible metadata.

```typescript
// src/application/exceptions/application.exception.ts

import { InsufficientFundsError } from '../../domain/errors/insufficient-funds.error';
import { WalletNotFoundError } from '../../domain/errors/wallet-not-found.error';

export enum ApplicationErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  CONFLICT = 'CONFLICT',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  OPTIMISTIC_LOCK = 'OPTIMISTIC_LOCK',
}

export class ApplicationException extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApplicationException';
  }

  static notFound(entity: string, identifier: string): ApplicationException {
    return new ApplicationException(
      ApplicationErrorCode.NOT_FOUND,
      `${entity} not found: ${identifier}`,
      { entity, identifier },
    );
  }

  static badRequest(message: string): ApplicationException {
    return new ApplicationException(
      ApplicationErrorCode.BAD_REQUEST,
      message,
    );
  }

  static conflict(message: string): ApplicationException {
    return new ApplicationException(
      ApplicationErrorCode.CONFLICT,
      message,
    );
  }

  static unprocessable(message: string, details?: Record<string, unknown>): ApplicationException {
    return new ApplicationException(
      ApplicationErrorCode.UNPROCESSABLE_ENTITY,
      message,
      details,
    );
  }

  /**
   * Map a domain error to an ApplicationException.
   * This is the boundary translation between domain and application layers.
   */
  static fromDomainError(error: Error): ApplicationException {
    if (error instanceof InsufficientFundsError) {
      return new ApplicationException(
        ApplicationErrorCode.UNPROCESSABLE_ENTITY,
        error.message,
        {
          code: error.code,
          userId: error.userId,
          requestedAmount: error.requestedAmount,
          availableBalance: error.availableBalance,
        },
      );
    }

    if (error instanceof WalletNotFoundError) {
      return ApplicationException.notFound('Wallet', error.identifier);
    }

    // Fallback for unknown domain errors
    return new ApplicationException(
      ApplicationErrorCode.INTERNAL_ERROR,
      error.message,
    );
  }
}
```

### 3.3 Global ExceptionFilter for the Presentation Layer

NestJS exception filters catch all unhandled exceptions and transform them into structured HTTP responses.

```typescript
// src/presentation/filters/global-exception.filter.ts

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApplicationException,
  ApplicationErrorCode,
} from '../../application/exceptions/application.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  private static readonly ERROR_CODE_TO_HTTP_STATUS: Record<
    ApplicationErrorCode,
    HttpStatus
  > = {
    [ApplicationErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
    [ApplicationErrorCode.BAD_REQUEST]: HttpStatus.BAD_REQUEST,
    [ApplicationErrorCode.CONFLICT]: HttpStatus.CONFLICT,
    [ApplicationErrorCode.UNPROCESSABLE_ENTITY]: HttpStatus.UNPROCESSABLE_ENTITY,
    [ApplicationErrorCode.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
    [ApplicationErrorCode.OPTIMISTIC_LOCK]: HttpStatus.CONFLICT,
  };

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: HttpStatus;
    let body: Record<string, unknown>;

    if (exception instanceof ApplicationException) {
      status =
        GlobalExceptionFilter.ERROR_CODE_TO_HTTP_STATUS[exception.code] ??
        HttpStatus.INTERNAL_SERVER_ERROR;
      body = {
        statusCode: status,
        error: exception.code,
        message: exception.message,
        details: exception.details,
        timestamp: new Date().toISOString(),
        path: request.url,
      };
    } else if (exception instanceof HttpException) {
      // Handle NestJS built-in exceptions (validation pipe, etc.)
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      body = {
        statusCode: status,
        error: typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as Record<string, unknown>).error,
        message: typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as Record<string, unknown>).message,
        timestamp: new Date().toISOString(),
        path: request.url,
      };
    } else {
      // Unexpected errors - log full stack, return generic message
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : String(exception),
      );
      body = {
        statusCode: status,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
        path: request.url,
      };
    }

    response.status(status).json(body);
  }
}
```

Register the filter globally in `main.ts`:

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './presentation/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

### 3.4 Error Flow Summary

```
Domain Layer                Application Layer              Presentation Layer
─────────────              ──────────────────             ──────────────────
wallet.debit()             useCase.execute()              controller.processTransaction()
  │                          │                              │
  ├─ Result.ok()      →     └─ continue                    └─ return 201
  │                              │
  └─ Result.fail(              │
      InsufficientFunds)   →  throw ApplicationException    GlobalExceptionFilter
                               (UNPROCESSABLE_ENTITY)        → 422 JSON response
```

### 3.5 Best Practices: When to Use Which Strategy

| Layer | Strategy | Rationale |
|-------|----------|-----------|
| **Domain** | `Result<T, E>` | No exceptions. Methods are honest about their failure modes via the return type. Makes domain logic pure and testable. |
| **Application** | Throw `ApplicationException` | Use cases orchestrate workflows. Exceptions simplify control flow when multiple steps can fail. The application layer is the natural place to translate domain Results into application-level errors. |
| **Presentation** | `GlobalExceptionFilter` | Centralized error-to-HTTP mapping. Controllers stay thin and do not contain error handling logic. |
| **Infrastructure** | Let Prisma/library errors propagate | Infrastructure errors (DB connection, timeouts) should bubble up as unhandled exceptions. The global filter catches them and returns 500. For expected infrastructure errors (optimistic lock), throw `ApplicationException`. |

---

## 4. Repository Pattern with Prisma

### 4.1 Interface-First Approach

The domain layer defines what persistence operations are needed (the port). The infrastructure layer decides how to implement them (the adapter). This means:

1. Define the interface in `src/domain/interfaces/`
2. Implement it in `src/infrastructure/repositories/`
3. Bind the interface token to the implementation in the infrastructure module

```typescript
// src/domain/interfaces/transaction-repository.interface.ts

import { Transaction } from '../entities/transaction.entity';
import { Wallet } from '../entities/wallet.entity';

export interface ITransactionRepository {
  findById(id: string): Promise<Transaction | null>;

  findByIdempotencyKey(key: string): Promise<Transaction | null>;

  findByUserId(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      fromDate?: Date;
      toDate?: Date;
    },
  ): Promise<Transaction[]>;

  save(transaction: Transaction): Promise<Transaction>;

  /**
   * Atomically save a transaction and update the wallet balance.
   * Both must succeed or both must fail.
   */
  saveWithWalletUpdate(
    transaction: Transaction,
    wallet: Wallet,
  ): Promise<Transaction>;

  countByUserIdInWindow(
    userId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<number>;
}
```

### 4.2 Prisma Implementation with Transactional Writes

```typescript
// src/infrastructure/repositories/prisma-transaction.repository.ts

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ITransactionRepository } from '../../domain/interfaces/transaction-repository.interface';
import { Transaction, TransactionType, TransactionStatus } from '../../domain/entities/transaction.entity';
import { Wallet } from '../../domain/entities/wallet.entity';
import { Money } from '../../domain/value-objects/money.value-object';
import { PrismaService } from '../database/prisma.service';
import { OptimisticLockException } from '../../application/exceptions/optimistic-lock.exception';

@Injectable()
export class PrismaTransactionRepository implements ITransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Transaction | null> {
    const record = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    const record = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: key },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number; fromDate?: Date; toDate?: Date },
  ): Promise<Transaction[]> {
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(options?.fromDate || options?.toDate
        ? {
            createdAt: {
              ...(options.fromDate ? { gte: options.fromDate } : {}),
              ...(options.toDate ? { lte: options.toDate } : {}),
            },
          }
        : {}),
    };

    const records = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });

    return records.map((r) => this.toDomain(r));
  }

  async save(transaction: Transaction): Promise<Transaction> {
    const record = await this.prisma.transaction.create({
      data: this.toPersistence(transaction),
    });
    return this.toDomain(record);
  }

  /**
   * Atomic transaction + wallet update using Prisma interactive transactions.
   * Implements optimistic locking on the wallet via version check.
   */
  async saveWithWalletUpdate(
    transaction: Transaction,
    wallet: Wallet,
  ): Promise<Transaction> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: update wallet only if version matches
      const updateResult = await tx.wallet.updateMany({
        where: {
          id: wallet.id,
          version: wallet.version, // Only update if version has not changed
        },
        data: {
          balance: wallet.balance.value,
          updatedAt: wallet.updatedAt,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new OptimisticLockException('Wallet', wallet.id);
      }

      // Create the transaction record
      const txRecord = await tx.transaction.create({
        data: this.toPersistence(transaction),
      });

      return txRecord;
    });

    return this.toDomain(result);
  }

  async countByUserIdInWindow(
    userId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<number> {
    return this.prisma.transaction.count({
      where: {
        userId,
        createdAt: { gte: windowStart, lte: windowEnd },
      },
    });
  }

  /** Map from Prisma record to domain entity. */
  private toDomain(record: {
    id: string;
    walletId: string;
    userId: string;
    type: string;
    amount: number;
    currency: string;
    description: string | null;
    status: string;
    idempotencyKey: string;
    createdAt: Date;
    updatedAt: Date;
  }): Transaction {
    return Transaction.reconstitute({
      id: record.id,
      walletId: record.walletId,
      userId: record.userId,
      type: record.type as TransactionType,
      amount: Money.of(record.amount, record.currency),
      description: record.description ?? '',
      status: record.status as TransactionStatus,
      idempotencyKey: record.idempotencyKey,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  /** Map from domain entity to Prisma create input. */
  private toPersistence(transaction: Transaction): Prisma.TransactionCreateInput {
    return {
      id: transaction.id,
      walletId: transaction.walletId,
      userId: transaction.userId,
      type: transaction.type,
      amount: transaction.amount.value,
      currency: transaction.amount.currency,
      description: transaction.description,
      status: transaction.status,
      idempotencyKey: transaction.idempotencyKey,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }
}
```

### 4.3 Entity-Prisma Model Mapping (Reconstitute Pattern)

The mapping between domain entities and Prisma records follows a clear pattern:

- **Domain to Persistence** (`toPersistence`): Extracts primitive values from domain entities and value objects to create a Prisma input object. Value objects like `Money` are flattened into their constituent fields (`amount` + `currency`).
- **Persistence to Domain** (`toDomain`): Uses the entity's `reconstitute` static method to hydrate a domain entity from raw data. This bypasses factory validation (since the data already passed validation when it was first created).

```
┌─────────────────┐           ┌──────────────────┐
│  Domain Entity   │           │   Prisma Model    │
│                  │           │                   │
│  Wallet {        │  toPers.  │  wallet {          │
│    id            │ ───────→  │    id              │
│    userId        │           │    user_id         │
│    balance:Money │           │    balance: Int    │
│     └─ value     │           │    currency: Str   │
│     └─ currency  │           │    version: Int    │
│    version       │           │    created_at      │
│  }               │           │    updated_at      │
│                  │  toDomain │  }                 │
│                  │ ←───────  │                   │
└─────────────────┘           └──────────────────┘
```

Key points:
- `reconstitute()` is deliberately separate from `create()`. The `create()` factory method validates inputs and raises domain events. `reconstitute()` trusts the data (it came from the database) and skips validation and event emission.
- Value objects are decomposed to primitives for storage and recomposed during hydration.
- The mapping methods are private to the repository -- no other layer needs to know about the persistence schema.

### 4.4 Optimistic Locking with Prisma

For a financial service, concurrent balance updates are a critical concern. Two simultaneous withdrawals could both read the same balance and both succeed, resulting in a negative balance.

Optimistic locking solves this without database-level locks:

1. Every wallet row has a `version` column (integer, starts at 1).
2. When updating, the `WHERE` clause includes `version = currentVersion`.
3. If another process updated the row first, `updateMany` returns `count: 0`.
4. The application retries the operation or returns a conflict error.

```typescript
// Optimistic lock pattern in saveWithWalletUpdate (shown above):
const updateResult = await tx.wallet.updateMany({
  where: {
    id: wallet.id,
    version: wallet.version, // Concurrency guard
  },
  data: {
    balance: wallet.balance.value,
    version: { increment: 1 }, // Bump version on success
  },
});

if (updateResult.count === 0) {
  throw new OptimisticLockException('Wallet', wallet.id);
}
```

The `OptimisticLockException` is caught by the application layer, which can either retry or propagate:

```typescript
// src/application/exceptions/optimistic-lock.exception.ts

import { ApplicationException, ApplicationErrorCode } from './application.exception';

export class OptimisticLockException extends ApplicationException {
  constructor(entity: string, id: string) {
    super(
      ApplicationErrorCode.OPTIMISTIC_LOCK,
      `Concurrent modification detected for ${entity} ${id}. Please retry.`,
      { entity, id },
    );
  }
}
```

#### Retry Strategy for Optimistic Locking

```typescript
// src/application/common/retry.ts

export async function withOptimisticRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof OptimisticLockException && attempt < maxRetries) {
        lastError = error;
        // Brief backoff before retry
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 50),
        );
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

// Usage in use case:
async execute(dto: ProcessTransactionDto): Promise<TransactionResponseDto> {
  return withOptimisticRetry(async () => {
    // ... full transaction processing logic (re-reads wallet on each attempt)
  });
}
```

### 4.5 PrismaService with Lifecycle Hooks

```typescript
// src/infrastructure/database/prisma.service.ts

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'error'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      this.$on('query', (event) => {
        if (event.duration > 100) {
          this.logger.warn(
            `Slow query (${event.duration}ms): ${event.query}`,
          );
        }
      });
    }

    this.$on('error', (event) => {
      this.logger.error(`Prisma error: ${event.message}`);
    });

    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Health check for the database connection.
   * Used by the health controller.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
```

### 4.6 Prisma Schema for the Wallet Domain

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Wallet {
  id        String   @id @default(uuid())
  userId    String   @unique @map("user_id")
  balance   Int      @default(0)    // Stored as integer cents
  currency  String   @default("COP")
  version   Int      @default(1)    // Optimistic locking
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  transactions Transaction[]

  @@map("wallets")
}

model Transaction {
  id             String   @id @default(uuid())
  walletId       String   @map("wallet_id")
  userId         String   @map("user_id")
  type           String   // DEPOSIT, WITHDRAWAL
  amount         Int      // Stored as integer cents
  currency       String   @default("COP")
  description    String?
  status         String   @default("COMPLETED") // PENDING, COMPLETED, FAILED
  idempotencyKey String   @unique @map("idempotency_key")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  wallet Wallet @relation(fields: [walletId], references: [id])

  @@index([userId, createdAt])
  @@index([walletId])
  @@map("transactions")
}

model FraudAlert {
  id          String   @id @default(uuid())
  userId      String   @map("user_id")
  alertType   String   @map("alert_type")  // VELOCITY, AMOUNT, PATTERN
  severity    String   // LOW, MEDIUM, HIGH, CRITICAL
  description String
  metadata    Json?    @default("{}")
  resolved    Boolean  @default(false)
  resolvedAt  DateTime? @map("resolved_at")
  resolvedBy  String?  @map("resolved_by")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([userId])
  @@index([resolved, createdAt])
  @@map("fraud_alerts")
}
```

---

## 5. Recommendations for This Project

### 5.1 Patterns to Adopt for the Financial Domain

#### A. Idempotency Key Pattern

Every mutation endpoint (especially `POST /transactions`) must be idempotent. Clients include an `Idempotency-Key` header or field. The server checks for a prior transaction with the same key before processing.

```typescript
// src/application/dtos/process-transaction.dto.ts

import { IsString, IsNumber, IsEnum, IsOptional, IsPositive, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum TransactionTypeDto {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

export class ProcessTransactionDto {
  @ApiProperty({ description: 'User ID who owns the wallet' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: TransactionTypeDto })
  @IsEnum(TransactionTypeDto)
  type: TransactionTypeDto;

  @ApiProperty({ description: 'Amount in the wallet currency (e.g., 50000 for 50,000 COP)' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Unique key to ensure exactly-once processing. Client-generated UUID.',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}
```

The use case checks the idempotency key first:

```typescript
// In ProcessTransactionUseCase.execute():
const existing = await this.transactionRepository.findByIdempotencyKey(
  dto.idempotencyKey,
);
if (existing) {
  // Return the existing transaction -- no duplicate processing
  return TransactionResponseDto.fromEntity(existing);
}
```

The database enforces uniqueness on `idempotency_key` as a safety net even if the application-level check races.

#### B. Event-Driven Architecture with NestJS EventEmitter2

Domain events decouple the transaction processing from side effects like fraud detection, notifications, and audit logging.

```typescript
// src/domain/events/domain-event.ts

export abstract class DomainEvent {
  public readonly occurredAt: Date;

  protected constructor(public readonly eventName: string) {
    this.occurredAt = new Date();
  }
}

// src/domain/events/transaction-completed.event.ts

import { DomainEvent } from './domain-event';

export class TransactionCompletedEvent extends DomainEvent {
  constructor(
    public readonly transactionId: string,
    public readonly walletId: string,
    public readonly userId: string,
    public readonly type: string,
    public readonly amount: number,
    public readonly currency: string,
  ) {
    super('transaction.completed');
  }
}
```

Event handlers are registered in the application or infrastructure layer:

```typescript
// src/application/event-handlers/fraud-check.handler.ts

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TransactionCompletedEvent } from '../../domain/events/transaction-completed.event';
import { FraudDetectionService } from '../services/fraud-detection.service';

@Injectable()
export class FraudCheckHandler {
  constructor(private readonly fraudDetection: FraudDetectionService) {}

  @OnEvent('transaction.completed')
  async handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
    await this.fraudDetection.analyzeTransaction({
      transactionId: event.transactionId,
      userId: event.userId,
      type: event.type,
      amount: event.amount,
      currency: event.currency,
      occurredAt: event.occurredAt,
    });
  }
}

// src/application/event-handlers/audit-log.handler.ts

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TransactionCompletedEvent } from '../../domain/events/transaction-completed.event';

@Injectable()
export class AuditLogHandler {
  private readonly logger = new Logger('AuditLog');

  @OnEvent('transaction.completed')
  async handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
    this.logger.log(
      `AUDIT: Transaction ${event.transactionId} completed. ` +
      `User: ${event.userId}, Type: ${event.type}, Amount: ${event.amount} ${event.currency}`,
    );
    // In production: persist to audit log table or external audit service
  }
}
```

Register event handlers in the application module:

```typescript
@Module({
  providers: [
    ProcessTransactionUseCase,
    GetBalanceUseCase,
    GetTransactionHistoryUseCase,
    FraudCheckHandler,
    AuditLogHandler,
    FraudDetectionService,
  ],
  exports: [
    ProcessTransactionUseCase,
    GetBalanceUseCase,
    GetTransactionHistoryUseCase,
  ],
})
export class ApplicationModule {}
```

Benefits of this approach:
- **Decoupled**: Adding a new side effect (e.g., notifications) requires only a new handler, no changes to the use case.
- **Testable**: Each handler can be tested independently with mock events.
- **Non-blocking** (optionally): EventEmitter2 supports async event handlers. For strict ordering or guaranteed delivery, consider upgrading to a message broker (RabbitMQ, SQS) later.

#### C. Fraud Detection Domain Service

Fraud detection is a cross-cutting business concern. It inspects transactions against configurable rules. Modeled as a domain service that the application layer calls via event handlers:

```typescript
// src/application/services/fraud-detection.service.ts

import { Injectable, Inject, Logger } from '@nestjs/common';
import { ITransactionRepository } from '../../domain/interfaces/transaction-repository.interface';
import { IFraudAlertRepository } from '../../domain/interfaces/fraud-alert-repository.interface';
import { FraudAlert } from '../../domain/entities/fraud-alert.entity';
import { INJECTION_TOKENS } from '../../domain/interfaces/injection-tokens';

interface TransactionAnalysis {
  transactionId: string;
  userId: string;
  type: string;
  amount: number;
  currency: string;
  occurredAt: Date;
}

@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);

  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(INJECTION_TOKENS.FRAUD_ALERT_REPOSITORY)
    private readonly fraudAlertRepository: IFraudAlertRepository,
    @Inject('FRAUD_CONFIG')
    private readonly config: {
      velocityWindowMinutes: number;
      velocityMaxTransactions: number;
      amountThreshold: number;
    },
  ) {}

  async analyzeTransaction(analysis: TransactionAnalysis): Promise<void> {
    const alerts: FraudAlert[] = [];

    // Rule 1: Velocity check -- too many transactions in a short window
    const windowStart = new Date(
      analysis.occurredAt.getTime() - this.config.velocityWindowMinutes * 60 * 1000,
    );
    const txCountInWindow = await this.transactionRepository.countByUserIdInWindow(
      analysis.userId,
      windowStart,
      analysis.occurredAt,
    );

    if (txCountInWindow > this.config.velocityMaxTransactions) {
      alerts.push(
        FraudAlert.create({
          userId: analysis.userId,
          alertType: 'VELOCITY',
          severity: 'HIGH',
          description:
            `${txCountInWindow} transactions in ${this.config.velocityWindowMinutes} minutes ` +
            `(threshold: ${this.config.velocityMaxTransactions})`,
          metadata: {
            transactionId: analysis.transactionId,
            windowMinutes: this.config.velocityWindowMinutes,
            transactionCount: txCountInWindow,
          },
        }),
      );
    }

    // Rule 2: Amount threshold -- unusually large transaction
    if (analysis.amount > this.config.amountThreshold * 100) {
      // amountThreshold in config is in decimal, amount is in cents
      alerts.push(
        FraudAlert.create({
          userId: analysis.userId,
          alertType: 'AMOUNT',
          severity: 'MEDIUM',
          description:
            `Transaction amount ${analysis.amount / 100} ${analysis.currency} ` +
            `exceeds threshold ${this.config.amountThreshold}`,
          metadata: {
            transactionId: analysis.transactionId,
            amount: analysis.amount,
            threshold: this.config.amountThreshold * 100,
          },
        }),
      );
    }

    // Persist any triggered alerts
    for (const alert of alerts) {
      await this.fraudAlertRepository.save(alert);
      this.logger.warn(
        `Fraud alert triggered: ${alert.alertType} for user ${alert.userId}`,
      );
    }
  }
}
```

### 5.2 Recommended Module Structure

```
src/
├── app.module.ts                          # Composition root
├── main.ts                                # Bootstrap
│
├── domain/
│   ├── entities/
│   │   ├── wallet.entity.ts
│   │   ├── transaction.entity.ts
│   │   └── fraud-alert.entity.ts
│   ├── value-objects/
│   │   └── money.value-object.ts
│   ├── interfaces/
│   │   ├── wallet-repository.interface.ts
│   │   ├── transaction-repository.interface.ts
│   │   ├── fraud-alert-repository.interface.ts
│   │   └── injection-tokens.ts
│   ├── errors/
│   │   ├── insufficient-funds.error.ts
│   │   ├── wallet-not-found.error.ts
│   │   └── duplicate-wallet.error.ts
│   ├── events/
│   │   ├── domain-event.ts
│   │   ├── wallet-created.event.ts
│   │   └── transaction-completed.event.ts
│   └── common/
│       └── result.ts
│
├── application/
│   ├── application.module.ts
│   ├── use-cases/
│   │   ├── process-transaction.use-case.ts
│   │   ├── get-balance.use-case.ts
│   │   ├── get-transaction-history.use-case.ts
│   │   └── create-wallet.use-case.ts
│   ├── dtos/
│   │   ├── process-transaction.dto.ts
│   │   ├── transaction-response.dto.ts
│   │   ├── balance-response.dto.ts
│   │   └── create-wallet.dto.ts
│   ├── services/
│   │   └── fraud-detection.service.ts
│   ├── event-handlers/
│   │   ├── fraud-check.handler.ts
│   │   └── audit-log.handler.ts
│   ├── exceptions/
│   │   ├── application.exception.ts
│   │   └── optimistic-lock.exception.ts
│   └── common/
│       └── retry.ts
│
├── infrastructure/
│   ├── infrastructure.module.ts
│   ├── database/
│   │   └── prisma.service.ts
│   ├── repositories/
│   │   ├── prisma-wallet.repository.ts
│   │   ├── prisma-transaction.repository.ts
│   │   └── prisma-fraud-alert.repository.ts
│   └── services/
│       └── (external integrations)
│
└── presentation/
    ├── presentation.module.ts
    ├── controllers/
    │   ├── transaction.controller.ts
    │   ├── wallet.controller.ts
    │   ├── fraud.controller.ts
    │   └── health.controller.ts
    ├── filters/
    │   └── global-exception.filter.ts
    └── decorators/
        └── (custom decorators)
```

### 5.3 Summary of Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Money representation | Integer cents (not floats) | Eliminates floating-point precision errors in financial calculations |
| Concurrency control | Optimistic locking with version column | Avoids database-level locks while preventing lost updates. Appropriate for moderate contention. |
| Idempotency | Client-provided idempotency key + unique constraint | Ensures exactly-once processing for network retries and duplicate requests |
| Error flow | Domain: Result / Application: Exceptions / Presentation: Filter | Each layer uses the most appropriate error mechanism for its concerns |
| Event publishing | Collect in entity, publish after persistence | Ensures events are only emitted for successfully persisted state changes |
| Entity creation | Factory method (`create`) + reconstitution (`reconstitute`) | Separates creation validation from hydration. Prevents invalid domain objects. |
| DI tokens | Centralized string constants | Avoids magic strings, enables refactoring, maintains loose coupling |
| Infrastructure module | `@Global()` | Repository bindings available everywhere. Acceptable because tokens are abstract. |
| Fraud detection | Event-driven, async | Decoupled from transaction processing. Non-blocking. Independently testable. |

### 5.4 Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Optimistic lock contention under high load | Retry with exponential backoff (max 3 attempts). Monitor conflict rate. If high, consider pessimistic locking (`SELECT ... FOR UPDATE`). |
| EventEmitter2 is in-process, no guaranteed delivery | Acceptable for MVP. For production, add an outbox pattern or move to a message broker (SQS, RabbitMQ). |
| Prisma ORM overhead for complex queries | Use raw SQL via `$queryRaw` for performance-critical queries (e.g., fraud velocity checks with window functions). |
| Value object overhead (many small allocations) | Monitor with profiling. In practice, the overhead is negligible for a transaction-processing service. |

---

## References

- Clean Architecture (Robert C. Martin, 2017)
- NestJS Documentation: Custom Providers - https://docs.nestjs.com/fundamentals/custom-providers
- NestJS Documentation: Exception Filters - https://docs.nestjs.com/exception-filters
- Prisma Documentation: Transactions - https://www.prisma.io/docs/concepts/components/prisma-client/transactions
- Prisma Documentation: Optimistic Concurrency Control - https://www.prisma.io/docs/guides/performance-and-optimization/prisma-client-transactions-guide
- NestJS Event Emitter - https://docs.nestjs.com/techniques/events
- Enterprise Integration Patterns: Idempotent Receiver (Hohpe & Woolf, 2003)
