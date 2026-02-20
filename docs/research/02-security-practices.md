# Security Best Practices for Financial Transaction Processing

## Research Document - Refacil Wallet

**Date**: 2026-02-20
**Agent**: security-researcher
**Phase**: 1 - Research (Parallel)
**Scope**: Input validation, SQL injection prevention, race conditions, audit logging, OWASP guidelines

---

## Table of Contents

1. [Input Validation Strategies with class-validator](#1-input-validation-strategies-with-class-validator)
2. [SQL Injection Prevention with Prisma ORM](#2-sql-injection-prevention-with-prisma-orm)
3. [Race Condition Handling in Balance Updates](#3-race-condition-handling-in-balance-updates)
4. [Audit Logging Requirements for Financial Systems](#4-audit-logging-requirements-for-financial-systems)
5. [OWASP Guidelines for Fintech Applications](#5-owasp-guidelines-for-fintech-applications)
6. [Recommendations for This Project](#6-recommendations-for-this-project)

---

## 1. Input Validation Strategies with class-validator

Financial applications demand rigorous input validation at every entry point. A single malformed or malicious input can cause data corruption, monetary loss, or security breaches. The `class-validator` library combined with NestJS's `ValidationPipe` provides a declarative, decorator-based approach that catches invalid data before it reaches business logic.

### 1.1 Decorator-Based Validation for DTOs

Every field in a DTO must be explicitly validated. For a financial transaction microservice, the following decorators are essential:

```typescript
import {
  IsUUID,
  IsNumber,
  IsPositive,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsString,
  Min,
  Max,
  IsOptional,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateTransactionDto {
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  @IsNotEmpty()
  userId: string;

  @IsIn(['deposit', 'withdraw'], {
    message: 'type must be either "deposit" or "withdraw"',
  })
  @IsNotEmpty()
  type: 'deposit' | 'withdraw';

  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @IsPositive({ message: 'amount must be greater than zero' })
  @Min(0.01, { message: 'Minimum transaction amount is 0.01' })
  @Max(1_000_000, { message: 'Maximum transaction amount is 1,000,000' })
  amount: number;

  @IsISO8601(
    { strict: true },
    { message: 'timestamp must be a valid ISO 8601 date' },
  )
  @IsOptional()
  timestamp?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'description cannot exceed 255 characters' })
  @Transform(({ value }) => value?.trim())
  description?: string;
}
```

**Key decorator choices explained:**

| Decorator | Purpose | Why It Matters |
|-----------|---------|----------------|
| `@IsUUID('4')` | Validates UUID v4 format | Prevents injection via malformed IDs |
| `@IsNumber({ maxDecimalPlaces: 2 })` | Enforces decimal precision | Prevents floating-point financial errors |
| `@IsPositive()` | Rejects zero and negative values | Prevents negative-amount attacks |
| `@Min() / @Max()` | Enforces business range limits | Prevents absurd transactions |
| `@IsIn([...])` | Whitelist of allowed values | Prevents enum bypass attacks |
| `@IsISO8601({ strict: true })` | Validates date format strictly | Prevents date parsing exploits |
| `@MaxLength(255)` | Limits string length | Prevents buffer overflow/DoS |

### 1.2 Custom Validators for Financial Amounts

The built-in `@IsNumber` decorator is not sufficient for financial precision. A custom validator ensures amounts conform to financial standards:

```typescript
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsFinancialAmountConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'number') return false;

    // Reject NaN, Infinity, -Infinity
    if (!Number.isFinite(value)) return false;

    // Must be positive
    if (value <= 0) return false;

    // Check decimal places (max 2 for currency)
    const decimalStr = value.toString();
    const decimalIndex = decimalStr.indexOf('.');
    if (decimalIndex !== -1) {
      const decimalPlaces = decimalStr.length - decimalIndex - 1;
      if (decimalPlaces > 2) return false;
    }

    // Check against configurable min/max
    const [min, max] = args.constraints;
    if (value < min || value > max) return false;

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const [min, max] = args.constraints;
    return `Amount must be a positive number between ${min} and ${max} with at most 2 decimal places`;
  }
}

export function IsFinancialAmount(
  min: number = 0.01,
  max: number = 1_000_000,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [min, max],
      validator: IsFinancialAmountConstraint,
    });
  };
}
```

**Usage in a DTO:**

```typescript
export class CreateTransactionDto {
  @IsFinancialAmount(0.01, 1_000_000)
  amount: number;
}
```

**Why a custom validator is necessary for financial amounts:**

- `@IsNumber({ maxDecimalPlaces: 2 })` does not catch edge cases like `Number.MAX_SAFE_INTEGER` overflow
- Business rules for min/max are coupled with precision validation in one place
- Custom error messages are tailored for financial context
- The validator can be extended to handle currency-specific rules (e.g., JPY has zero decimal places)

### 1.3 ValidationPipe Configuration in NestJS

The `ValidationPipe` is the first line of defense. Configure it globally in `main.ts`:

```typescript
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties that don't have decorators
      whitelist: true,

      // Throw an error when non-whitelisted properties are present
      forbidNonWhitelisted: true,

      // Automatically transform payloads to DTO instances
      transform: true,
      transformOptions: {
        enableImplicitConversion: false, // IMPORTANT: do NOT enable implicit conversion
      },

      // Return all validation errors at once
      stopAtFirstError: false,

      // Custom error formatting - sanitize error details
      exceptionFactory: (errors) => {
        const messages = errors.map((error) => ({
          field: error.property,
          constraints: Object.values(error.constraints || {}),
        }));
        return new BadRequestException({
          statusCode: 400,
          message: 'Validation failed',
          errors: messages,
        });
      },
    }),
  );

  await app.listen(3000);
}
bootstrap();
```

**Critical settings explained:**

| Setting | Value | Rationale |
|---------|-------|-----------|
| `whitelist: true` | Strip unknown properties | Prevents mass-assignment attacks where extra fields are injected |
| `forbidNonWhitelisted: true` | Reject unknown properties | Alerts callers to malformed requests immediately |
| `transform: true` | Auto-transform to DTO instances | Ensures type coercion happens through class-transformer |
| `enableImplicitConversion: false` | No implicit type coercion | Prevents `"true"` becoming `true`, `"123"` becoming `123` without explicit `@Type()` |
| `exceptionFactory` | Custom error formatting | Prevents leaking internal validation details while remaining helpful |

**Why `enableImplicitConversion: false` matters for financial apps:**

With implicit conversion enabled, a string `"100"` would silently become the number `100`. This hides type mismatches that could indicate a malicious or buggy client. In financial applications, it is better to be explicit about type transformations:

```typescript
// Instead of implicit conversion, use explicit @Type() where needed:
export class QueryTransactionsDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  limit?: number;
}
```

### 1.4 Sanitization of String Inputs

Financial applications must sanitize string inputs to prevent XSS, log injection, and other attacks:

```typescript
import { Transform } from 'class-transformer';

// Reusable sanitization transform
export function Sanitize() {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return value
      .trim()
      .replace(/[<>]/g, '') // Remove angle brackets (basic XSS prevention)
      .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters (log injection)
  });
}

// Usage in DTO:
export class CreateTransactionDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  @Sanitize()
  description?: string;
}
```

**Log injection prevention is critical.** An attacker sending `"description": "normal\nERROR: Critical system failure"` could create fake log entries if not sanitized. Stripping control characters prevents newline injection into structured logs.

### 1.5 Validation at Multiple Layers

A defense-in-depth approach validates data at each architectural layer:

```
                    ┌─────────────────────────┐
  HTTP Request ───> │ Presentation Layer      │  ValidationPipe + DTO decorators
                    │ (CreateTransactionDto)   │  Syntax validation: types, format, ranges
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │ Application Layer        │  Business rule validation
                    │ (ProcessTransactionCmd)  │  Cross-field, contextual rules
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │ Domain Layer             │  Invariant enforcement
                    │ (Transaction entity)     │  Value objects, entity rules
                    │ (Money value object)     │  Self-validating construction
                    └─────────────────────────┘
```

**Layer 1: Presentation (DTO validation)**

```typescript
// Validates HTTP input syntax
export class CreateTransactionDto {
  @IsUUID('4')
  userId: string;

  @IsFinancialAmount(0.01, 1_000_000)
  amount: number;

  @IsIn(['deposit', 'withdraw'])
  type: string;
}
```

**Layer 2: Application (Business rule validation)**

```typescript
// Validates business context
export class ProcessTransactionUseCase {
  async execute(command: ProcessTransactionCommand): Promise<Result<Transaction>> {
    // Check wallet exists
    const wallet = await this.walletRepository.findByUserId(command.userId);
    if (!wallet) {
      return Result.fail(new WalletNotFoundError(command.userId));
    }

    // Check sufficient funds for withdrawal
    if (command.type === 'withdraw' && wallet.balance < command.amount) {
      return Result.fail(new InsufficientFundsError(wallet.balance, command.amount));
    }

    // Check daily transaction limits
    const dailyTotal = await this.transactionRepository.getDailyTotal(command.userId);
    if (dailyTotal + command.amount > DAILY_LIMIT) {
      return Result.fail(new DailyLimitExceededError(dailyTotal, command.amount));
    }

    // ...proceed with transaction
  }
}
```

**Layer 3: Domain (Invariant enforcement via Value Objects)**

```typescript
// Self-validating value object - impossible to create invalid Money
export class Money {
  private constructor(
    private readonly _amount: number,
    private readonly _currency: string,
  ) {}

  static create(amount: number, currency: string = 'COP'): Result<Money> {
    if (!Number.isFinite(amount)) {
      return Result.fail(new InvalidAmountError('Amount must be finite'));
    }
    if (amount < 0) {
      return Result.fail(new InvalidAmountError('Amount cannot be negative'));
    }

    // Round to 2 decimal places to avoid floating-point issues
    const rounded = Math.round(amount * 100) / 100;

    return Result.ok(new Money(rounded, currency));
  }

  get amount(): number {
    return this._amount;
  }

  add(other: Money): Result<Money> {
    if (this._currency !== other._currency) {
      return Result.fail(new CurrencyMismatchError(this._currency, other._currency));
    }
    return Money.create(this._amount + other._amount, this._currency);
  }

  subtract(other: Money): Result<Money> {
    if (this._currency !== other._currency) {
      return Result.fail(new CurrencyMismatchError(this._currency, other._currency));
    }
    if (this._amount < other._amount) {
      return Result.fail(new InsufficientFundsError(this._amount, other._amount));
    }
    return Money.create(this._amount - other._amount, this._currency);
  }
}
```

**Why triple validation matters:** Each layer catches different classes of errors. The presentation layer catches syntactically invalid inputs. The application layer catches contextually invalid operations (e.g., overdraw). The domain layer enforces invariants that must always hold, regardless of how the object is constructed.

---

## 2. SQL Injection Prevention with Prisma ORM

### 2.1 How Prisma Parameterizes Queries by Default

Prisma ORM provides strong SQL injection protection out of the box. When using the Prisma Client API, all user inputs are automatically parameterized:

```typescript
// SAFE: Prisma parameterizes the userId automatically
const transactions = await prisma.transaction.findMany({
  where: {
    userId: userInput, // This is parameterized, never interpolated
    amount: {
      gte: minAmount, // Also parameterized
    },
  },
});
```

Under the hood, Prisma generates:

```sql
SELECT * FROM "Transaction" WHERE "userId" = $1 AND "amount" >= $2
-- Parameters: [userInput, minAmount]
```

The Prisma query engine sends the query template and parameters separately to PostgreSQL. The database treats parameters as data, never as SQL code. This makes SQL injection impossible through the standard Prisma Client API.

**This applies to all standard Prisma operations:**
- `findMany`, `findUnique`, `findFirst`
- `create`, `createMany`
- `update`, `updateMany`
- `delete`, `deleteMany`
- `aggregate`, `groupBy`, `count`

### 2.2 Risks with `$queryRaw` and Safe Usage

The `$queryRaw` and `$executeRaw` methods bypass Prisma's query builder and execute raw SQL. These are the primary injection risk points.

**DANGEROUS: String interpolation in raw queries**

```typescript
// VULNERABLE - NEVER DO THIS
const userId = req.params.userId;
const result = await prisma.$queryRaw(
  `SELECT * FROM "Wallet" WHERE "user_id" = '${userId}'`
);
// An attacker sending userId = "'; DROP TABLE Wallet; --"
// would destroy the table
```

**SAFE: Tagged template literals (Prisma.sql)**

```typescript
// SAFE: Using tagged template literal
const userId = req.params.userId;
const result = await prisma.$queryRaw`
  SELECT * FROM "Wallet" WHERE "user_id" = ${userId}
`;
// Prisma automatically parameterizes ${userId}
```

**SAFE: Using Prisma.sql for dynamic queries**

```typescript
import { Prisma } from '@prisma/client';

// SAFE: Explicit parameterization
const userId = req.params.userId;
const result = await prisma.$queryRaw(
  Prisma.sql`SELECT * FROM "Wallet" WHERE "user_id" = ${userId}`
);
```

**SAFE: Parameterized raw queries for complex operations (e.g., locking)**

```typescript
// SAFE: SELECT FOR UPDATE with parameterized query
async function getWalletWithLock(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<Wallet> {
  const wallets = await tx.$queryRaw<Wallet[]>`
    SELECT * FROM "Wallet"
    WHERE "user_id" = ${userId}
    FOR UPDATE
  `;

  if (wallets.length === 0) {
    throw new WalletNotFoundError(userId);
  }

  return wallets[0];
}
```

### 2.3 Avoiding String Concatenation in Prisma Queries

Even with Prisma's standard API, there are subtle ways to introduce injection vulnerabilities through dynamic query construction:

**DANGEROUS: Dynamic field selection via string concatenation**

```typescript
// VULNERABLE - building orderBy from user input
const sortField = req.query.sortBy; // e.g., "amount; DROP TABLE Transaction"
const result = await prisma.$queryRaw(
  `SELECT * FROM "Transaction" ORDER BY ${sortField}`
);
```

**SAFE: Whitelist approach for dynamic fields**

```typescript
const ALLOWED_SORT_FIELDS = ['amount', 'createdAt', 'type'] as const;
type SortField = (typeof ALLOWED_SORT_FIELDS)[number];

function isSortField(value: string): value is SortField {
  return ALLOWED_SORT_FIELDS.includes(value as SortField);
}

// In the handler:
const sortBy = req.query.sortBy;
if (!isSortField(sortBy)) {
  throw new BadRequestException(`Invalid sort field: ${sortBy}`);
}

// SAFE: Now using Prisma's typed API
const result = await prisma.transaction.findMany({
  orderBy: { [sortBy]: 'desc' },
});
```

**SAFE: Using Prisma.sql with Prisma.raw for column names**

When you absolutely must use dynamic column names in raw queries, use `Prisma.raw` for the trusted parts:

```typescript
// Only use Prisma.raw for values from a trusted whitelist
const allowedColumns = new Map([
  ['amount', Prisma.raw('"amount"')],
  ['createdAt', Prisma.raw('"created_at"')],
]);

const column = allowedColumns.get(sortBy);
if (!column) throw new BadRequestException('Invalid sort field');

const result = await prisma.$queryRaw`
  SELECT * FROM "Transaction" ORDER BY ${column} DESC
`;
```

### 2.4 Best Practices for Dynamic Filtering

Financial applications often need dynamic query building (search, filter, paginate). Here is how to do it safely with Prisma:

```typescript
import { Prisma } from '@prisma/client';

interface TransactionFilters {
  userId?: string;
  type?: 'deposit' | 'withdraw';
  minAmount?: number;
  maxAmount?: number;
  startDate?: Date;
  endDate?: Date;
}

function buildTransactionWhere(
  filters: TransactionFilters,
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {};

  // Each condition uses Prisma's typed API - no injection possible
  if (filters.userId) {
    where.userId = filters.userId; // Parameterized by Prisma
  }

  if (filters.type) {
    where.type = filters.type; // Enum - only valid values accepted
  }

  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    where.amount = {};
    if (filters.minAmount !== undefined) {
      where.amount.gte = filters.minAmount; // Parameterized
    }
    if (filters.maxAmount !== undefined) {
      where.amount.lte = filters.maxAmount; // Parameterized
    }
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = filters.startDate; // Parameterized
    }
    if (filters.endDate) {
      where.createdAt.lte = filters.endDate; // Parameterized
    }
  }

  return where;
}

// Usage in repository
async findTransactions(filters: TransactionFilters, page: number, limit: number) {
  const where = buildTransactionWhere(filters);

  return prisma.transaction.findMany({
    where,
    skip: (page - 1) * limit,
    take: Math.min(limit, 100), // Cap at 100 to prevent DoS
    orderBy: { createdAt: 'desc' },
  });
}
```

**Rule of thumb:** If you can express the query using Prisma's typed query builder, always prefer that over `$queryRaw`. Reserve raw queries for PostgreSQL-specific features (e.g., `SELECT FOR UPDATE`, window functions, or advisory locks).

---

## 3. Race Condition Handling in Balance Updates

### 3.1 The Problem

Race conditions in balance updates are one of the most critical security issues in financial applications. Consider this scenario:

```
Wallet balance: $100

Thread A (withdraw $80):              Thread B (withdraw $80):
─────────────────────                 ─────────────────────
1. Read balance: $100                 1. Read balance: $100
2. Check: $100 >= $80 ✓              2. Check: $100 >= $80 ✓
3. New balance: $100 - $80 = $20     3. New balance: $100 - $80 = $20
4. Write balance: $20                4. Write balance: $20

Result: Both withdrawals succeed!
Wallet balance: $20 (should be -$60, which is invalid)
$60 has been created from nothing.
```

This is a **Time of Check to Time of Use (TOCTOU)** vulnerability. The check (sufficient balance) and the use (update balance) happen in separate steps, and another transaction can interleave between them.

Without proper concurrency control, an attacker can exploit this by sending multiple concurrent withdrawal requests, draining a wallet beyond its actual balance.

### 3.2 Pessimistic Locking: SELECT ... FOR UPDATE

Pessimistic locking prevents the race condition by acquiring an exclusive lock on the wallet row before reading it. No other transaction can read or modify the locked row until the lock is released.

**Implementation with Prisma:**

```typescript
import { Prisma, PrismaClient } from '@prisma/client';

interface Wallet {
  id: string;
  userId: string;
  balance: number;
  version: number;
  updatedAt: Date;
}

export class WalletRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Process a withdrawal with pessimistic locking.
   * Uses SELECT FOR UPDATE to prevent concurrent balance modifications.
   */
  async processWithdrawal(
    userId: string,
    amount: number,
  ): Promise<{ success: boolean; newBalance: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        // Step 1: Lock the wallet row - blocks other transactions
        const wallets = await tx.$queryRaw<Wallet[]>`
          SELECT id, "userId", balance, version, "updatedAt"
          FROM "Wallet"
          WHERE "userId" = ${userId}
          FOR UPDATE
        `;

        if (wallets.length === 0) {
          throw new WalletNotFoundError(userId);
        }

        const wallet = wallets[0];

        // Step 2: Check balance (now safe - row is locked)
        if (wallet.balance < amount) {
          throw new InsufficientFundsError(wallet.balance, amount);
        }

        // Step 3: Update balance (still within the lock)
        const newBalance = wallet.balance - amount;
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: newBalance,
            updatedAt: new Date(),
          },
        });

        // Step 4: Create transaction record
        await tx.transaction.create({
          data: {
            userId,
            type: 'withdraw',
            amount,
            balanceAfter: newBalance,
            status: 'completed',
          },
        });

        return { success: true, newBalance };
        // Lock is released when the transaction commits
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10_000, // 10-second timeout to prevent indefinite locks
      },
    );
  }
}
```

**How it works:**

```
Thread A (withdraw $80):                    Thread B (withdraw $80):
─────────────────────                       ─────────────────────
1. BEGIN TRANSACTION
2. SELECT ... FOR UPDATE
   → Acquires lock on wallet row
   → Reads balance: $100
                                            1. BEGIN TRANSACTION
                                            2. SELECT ... FOR UPDATE
                                               → BLOCKED (waiting for lock)
3. Check: $100 >= $80 ✓
4. UPDATE balance = $20
5. COMMIT
   → Lock released
                                               → Lock acquired
                                               → Reads balance: $20
                                            3. Check: $20 >= $80 ✗
                                            4. ROLLBACK (insufficient funds)

Result: Only one withdrawal succeeds. Balance is correctly $20.
```

**Pros of pessimistic locking:**

- Strong consistency guarantee - impossible to overdraw
- Simple to reason about - "lock, read, modify, unlock"
- Works correctly under any contention level
- The database handles all the synchronization

**Cons of pessimistic locking:**

- Performance impact: Blocked threads waste resources waiting
- Potential deadlocks: If two transactions lock rows in different order
- Reduced throughput: Only one transaction per wallet at a time
- Lock timeout tuning: Too short causes failures, too long causes latency

**Deadlock prevention strategies:**

```typescript
// Always lock wallets in a consistent order (e.g., by ID)
// This matters for transfers between wallets
async processTransfer(fromUserId: string, toUserId: string, amount: number) {
  return this.prisma.$transaction(async (tx) => {
    // Sort to ensure consistent lock order
    const [first, second] = [fromUserId, toUserId].sort();

    // Lock both wallets in deterministic order
    const wallet1 = await tx.$queryRaw<Wallet[]>`
      SELECT * FROM "Wallet" WHERE "userId" = ${first} FOR UPDATE
    `;
    const wallet2 = await tx.$queryRaw<Wallet[]>`
      SELECT * FROM "Wallet" WHERE "userId" = ${second} FOR UPDATE
    `;

    // Now process the transfer safely
    // ...
  });
}
```

### 3.3 Optimistic Locking: Version Field Approach

Optimistic locking assumes conflicts are rare and detects them at write time using a version counter. If a conflict is detected, the transaction is retried.

**Schema design:**

```prisma
model Wallet {
  id        String   @id @default(uuid())
  userId    String   @unique @map("user_id")
  balance   Float    @default(0)
  version   Int      @default(0) // Optimistic lock version
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("wallets")
}
```

**Implementation with Prisma:**

```typescript
export class WalletRepository {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 50;

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Process a withdrawal with optimistic locking.
   * Retries on version conflict up to MAX_RETRIES times.
   */
  async processWithdrawal(
    userId: string,
    amount: number,
  ): Promise<{ success: boolean; newBalance: number }> {
    for (let attempt = 1; attempt <= WalletRepository.MAX_RETRIES; attempt++) {
      try {
        return await this.attemptWithdrawal(userId, amount);
      } catch (error) {
        if (error instanceof OptimisticLockError) {
          if (attempt === WalletRepository.MAX_RETRIES) {
            throw new TransactionConflictError(
              `Failed after ${WalletRepository.MAX_RETRIES} attempts due to concurrent modifications`,
            );
          }
          // Exponential backoff with jitter
          const delay =
            WalletRepository.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          const jitter = Math.random() * delay * 0.5;
          await this.sleep(delay + jitter);
          continue;
        }
        throw error;
      }
    }

    throw new TransactionConflictError('Unexpected: exhausted retries');
  }

  private async attemptWithdrawal(
    userId: string,
    amount: number,
  ): Promise<{ success: boolean; newBalance: number }> {
    return this.prisma.$transaction(async (tx) => {
      // Step 1: Read the wallet (no lock)
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new WalletNotFoundError(userId);
      }

      // Step 2: Check balance
      if (wallet.balance < amount) {
        throw new InsufficientFundsError(wallet.balance, amount);
      }

      // Step 3: Update with version check
      const newBalance = wallet.balance - amount;
      const result = await tx.wallet.updateMany({
        where: {
          id: wallet.id,
          version: wallet.version, // Only update if version matches
        },
        data: {
          balance: newBalance,
          version: wallet.version + 1, // Increment version
          updatedAt: new Date(),
        },
      });

      // Step 4: Check if update succeeded
      if (result.count === 0) {
        // Version mismatch - another transaction modified the wallet
        throw new OptimisticLockError(
          `Wallet ${userId} was modified by another transaction`,
        );
      }

      // Step 5: Create transaction record
      await tx.transaction.create({
        data: {
          userId,
          type: 'withdraw',
          amount,
          balanceAfter: newBalance,
          status: 'completed',
        },
      });

      return { success: true, newBalance };
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

**How it works:**

```
Thread A (withdraw $80):                    Thread B (withdraw $80):
─────────────────────                       ─────────────────────
1. Read wallet: balance=$100, version=1     1. Read wallet: balance=$100, version=1
2. Check: $100 >= $80 ✓                    2. Check: $100 >= $80 ✓
3. UPDATE WHERE version=1                   3. UPDATE WHERE version=1
   → 1 row updated (success)                  → 0 rows updated (conflict!)
   → version is now 2
4. COMMIT                                   4. RETRY: Read wallet: balance=$20, version=2
                                            5. Check: $20 >= $80 ✗
                                            6. FAIL: Insufficient funds

Result: Only one withdrawal succeeds. No overdraw.
```

**Pros of optimistic locking:**

- Better performance under low contention (no blocking)
- No deadlock risk
- Higher throughput when conflicts are rare
- Works well with distributed systems

**Cons of optimistic locking:**

- Retry storms under high contention (many concurrent requests to same wallet)
- Wasted work: Read-check-write cycle is repeated on failure
- More complex implementation (retry logic, backoff)
- Not suitable when conflicts are frequent
- The retry loop can amplify load during contention spikes

### 3.4 Recommendation for This Project (1000 TPS)

**Primary recommendation: Pessimistic locking with `SELECT FOR UPDATE`.**

**Rationale for 1000 TPS target:**

| Factor | Pessimistic | Optimistic |
|--------|------------|------------|
| Consistency guarantee | Absolute | Depends on retry success |
| Implementation complexity | Lower | Higher (retry logic, backoff) |
| Performance at 1000 TPS | Adequate | Slightly better at low contention |
| Behavior under contention | Predictable (waits) | Unpredictable (retry storms) |
| Financial correctness | Guaranteed | Guaranteed if retries succeed |
| Deadlock risk | Manageable with ordering | None |

**Why pessimistic wins for this use case:**

1. **Financial correctness is non-negotiable.** Pessimistic locking guarantees it without relying on retry logic.
2. **1000 TPS is manageable.** This is the total system throughput, not per-wallet. The actual contention per wallet is much lower (a single user might generate 1-10 TPS at most).
3. **PostgreSQL handles it well.** PostgreSQL's MVCC and row-level locking are efficient. At 1000 TPS total, lock hold times of 5-20ms per transaction are well within capacity.
4. **Simpler to audit.** Auditors and code reviewers can easily verify that pessimistic locking is correct.
5. **Deadlocks are preventable.** By consistently ordering lock acquisition (always lock by wallet ID), deadlocks are eliminated.

**Recommended implementation pattern:**

```typescript
// Use a dedicated service method with clear locking semantics
async processTransaction(
  userId: string,
  type: 'deposit' | 'withdraw',
  amount: number,
): Promise<Transaction> {
  return this.prisma.$transaction(
    async (tx) => {
      // Always acquire lock first
      const wallet = await this.acquireWalletLock(tx, userId);

      // Business logic with locked wallet
      const newBalance =
        type === 'deposit'
          ? wallet.balance + amount
          : wallet.balance - amount;

      if (newBalance < 0) {
        throw new InsufficientFundsError(wallet.balance, amount);
      }

      // Update and record
      await this.updateWalletBalance(tx, wallet.id, newBalance);
      return this.createTransactionRecord(tx, userId, type, amount, newBalance);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10_000,
    },
  );
}

private async acquireWalletLock(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<Wallet> {
  const wallets = await tx.$queryRaw<Wallet[]>`
    SELECT * FROM "Wallet"
    WHERE "user_id" = ${userId}
    FOR UPDATE NOWAIT
  `;

  if (wallets.length === 0) {
    throw new WalletNotFoundError(userId);
  }

  return wallets[0];
}
```

**Note on `FOR UPDATE NOWAIT`:** The `NOWAIT` option causes the query to fail immediately if the row is already locked, instead of waiting. This is useful for fast-failing in high-throughput scenarios. The application can then return a 409 Conflict or 503 Service Unavailable, letting the client retry.

**Hybrid approach for future scaling (beyond 1000 TPS):**

If the system needs to scale beyond 1000 TPS per wallet (unlikely but possible for high-frequency trading scenarios), consider:

1. **Application-level serialization**: Use a queue (Redis, SQS) to serialize operations per wallet
2. **Advisory locks**: PostgreSQL advisory locks with `pg_advisory_xact_lock(wallet_id_hash)` for lighter-weight locking
3. **Event sourcing**: Replace balance column with an append-only event log, derive balance from events

---

## 4. Audit Logging Requirements for Financial Systems

### 4.1 What to Log

Financial systems must maintain a complete, immutable record of all state changes. This is not optional -- it is a regulatory requirement in most jurisdictions and essential for dispute resolution, fraud detection, and compliance auditing.

**Mandatory log events:**

| Category | Events | Required Fields |
|----------|--------|----------------|
| **Transactions** | Create, complete, fail, reverse | Transaction ID, user ID, amount, type, status, balance before/after |
| **Wallet Operations** | Create, activate, deactivate, freeze | Wallet ID, user ID, action, reason |
| **Balance Changes** | Any modification | Wallet ID, balance before, balance after, change amount, source transaction |
| **Fraud Events** | Alert created, resolved, escalated | Alert ID, user ID, rule triggered, confidence score, resolution |
| **System Events** | Startup, shutdown, config change | Component, action, details |
| **Error Events** | Failed operations, exceptions | Error code, message, stack trace (sanitized), request context |

**The "5 W's" of audit logging:**

Every audit log entry must answer:
- **Who**: User ID, system component, or external service
- **What**: The action performed and the data affected
- **When**: Timestamp with timezone (ISO 8601, UTC)
- **Where**: Service name, endpoint, server instance
- **Result**: Success/failure, new state, error details

### 4.2 Structured Logging with Pino

Pino is the recommended logging library for NestJS financial applications due to its high performance (minimal overhead), structured JSON output, and async logging capability.

**Setup with NestJS:**

```typescript
// src/infrastructure/logging/logger.module.ts
import { Module, Global } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty' }
            : undefined,

        // Redact sensitive fields
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.token',
            'req.body.cardNumber',
            'req.body.cvv',
            '*.ssn',
            '*.documentNumber',
          ],
          censor: '[REDACTED]',
        },

        // Custom serializers
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
            // Do NOT log full headers or body by default
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },

        // Generate correlation ID
        genReqId: (req) =>
          req.headers['x-correlation-id'] || crypto.randomUUID(),
      },
    }),
  ],
})
export class LoggerModule {}
```

**Audit log service:**

```typescript
// src/infrastructure/logging/audit-log.service.ts
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

export interface AuditLogEntry {
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  correlationId: string;
  details: Record<string, unknown>;
  result: 'success' | 'failure';
  errorCode?: string;
  errorMessage?: string;
  timestamp: string;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('AuditLog');
  }

  /**
   * Log a financial transaction event.
   * These logs form the immutable audit trail.
   */
  logTransaction(entry: {
    action: 'create' | 'complete' | 'fail' | 'reverse';
    transactionId: string;
    userId: string;
    correlationId: string;
    type: string;
    amount: number;
    balanceBefore?: number;
    balanceAfter?: number;
    result: 'success' | 'failure';
    errorCode?: string;
    errorMessage?: string;
  }): void {
    this.logger.info(
      {
        audit: true,
        action: `transaction.${entry.action}`,
        entityType: 'transaction',
        entityId: entry.transactionId,
        userId: entry.userId,
        correlationId: entry.correlationId,
        transactionType: entry.type,
        amount: entry.amount,
        balanceBefore: entry.balanceBefore,
        balanceAfter: entry.balanceAfter,
        result: entry.result,
        errorCode: entry.errorCode,
        errorMessage: entry.errorMessage,
        timestamp: new Date().toISOString(),
      },
      `Transaction ${entry.action}: ${entry.transactionId}`,
    );
  }

  /**
   * Log a wallet state change event.
   */
  logWalletChange(entry: {
    action: string;
    walletId: string;
    userId: string;
    correlationId: string;
    details: Record<string, unknown>;
    result: 'success' | 'failure';
  }): void {
    this.logger.info(
      {
        audit: true,
        action: `wallet.${entry.action}`,
        entityType: 'wallet',
        entityId: entry.walletId,
        userId: entry.userId,
        correlationId: entry.correlationId,
        details: entry.details,
        result: entry.result,
        timestamp: new Date().toISOString(),
      },
      `Wallet ${entry.action}: ${entry.walletId}`,
    );
  }

  /**
   * Log a fraud detection event.
   */
  logFraudEvent(entry: {
    action: 'alert_created' | 'alert_resolved' | 'alert_escalated';
    alertId: string;
    userId: string;
    correlationId: string;
    ruleTriggered: string;
    confidence: number;
    details: Record<string, unknown>;
  }): void {
    this.logger.warn(
      {
        audit: true,
        action: `fraud.${entry.action}`,
        entityType: 'fraud_alert',
        entityId: entry.alertId,
        userId: entry.userId,
        correlationId: entry.correlationId,
        ruleTriggered: entry.ruleTriggered,
        confidence: entry.confidence,
        details: entry.details,
        timestamp: new Date().toISOString(),
      },
      `Fraud ${entry.action}: ${entry.alertId}`,
    );
  }
}
```

### 4.3 Immutable Audit Trail Design

Audit logs in a financial system must be tamper-proof. The application should never update or delete audit records.

**Database-backed audit trail:**

```prisma
model AuditLog {
  id            String   @id @default(uuid())
  action        String   // e.g., "transaction.create"
  entityType    String   @map("entity_type")
  entityId      String   @map("entity_id")
  userId        String   @map("user_id")
  correlationId String   @map("correlation_id")
  details       Json     // Structured event data
  result        String   // "success" | "failure"
  ipAddress     String?  @map("ip_address")
  userAgent     String?  @map("user_agent")
  createdAt     DateTime @default(now()) @map("created_at")

  // No updatedAt - audit logs are immutable
  // No @updatedAt decorator

  @@index([userId, createdAt])
  @@index([entityType, entityId])
  @@index([correlationId])
  @@index([action, createdAt])
  @@map("audit_logs")
}
```

**Immutability enforcement at the database level:**

```sql
-- Prevent updates and deletes on audit_logs table
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER audit_logs_immutable_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();
```

### 4.4 Correlation IDs for Request Tracing

Every HTTP request must carry a correlation ID that flows through all operations, enabling end-to-end tracing.

**NestJS middleware for correlation ID:**

```typescript
// src/presentation/middleware/correlation-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER] as string) || randomUUID();

    // Attach to request for downstream use
    req['correlationId'] = correlationId;

    // Return in response for client-side tracing
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}
```

**Usage in services:**

```typescript
@Injectable()
export class ProcessTransactionUseCase {
  async execute(
    command: ProcessTransactionCommand,
    correlationId: string,
  ): Promise<Result<Transaction>> {
    this.auditLog.logTransaction({
      action: 'create',
      transactionId: command.transactionId,
      userId: command.userId,
      correlationId,
      type: command.type,
      amount: command.amount,
      result: 'success',
    });

    // ... process transaction

    this.auditLog.logTransaction({
      action: 'complete',
      transactionId: command.transactionId,
      userId: command.userId,
      correlationId,
      type: command.type,
      amount: command.amount,
      balanceBefore: wallet.balance,
      balanceAfter: newBalance,
      result: 'success',
    });
  }
}
```

### 4.5 PII Handling

Financial logs must never contain:
- Full names associated with user IDs in a way that allows re-identification without the database
- National identification numbers (cedula, SSN)
- Full card numbers or CVVs
- Passwords, tokens, or API keys
- Email addresses or phone numbers

**Pino's redaction feature handles this:**

```typescript
// In Pino configuration
redact: {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    '*.password',
    '*.token',
    '*.cardNumber',
    '*.cvv',
    '*.ssn',
    '*.documentNumber',
    '*.email',
    '*.phoneNumber',
  ],
  censor: '[REDACTED]',
},
```

**When logging user data, use only IDs:**

```typescript
// GOOD: Log user ID only
this.logger.info({ userId: user.id, action: 'withdrawal' }, 'Processing withdrawal');

// BAD: Logging PII
this.logger.info(
  { userName: user.name, email: user.email, action: 'withdrawal' },
  'Processing withdrawal',
);
```

### 4.6 Log Retention Policies

| Log Type | Retention | Storage | Rationale |
|----------|-----------|---------|-----------|
| Audit trail (DB) | 7 years | PostgreSQL + archival | Regulatory compliance (Colombian financial regulations) |
| Application logs | 90 days | CloudWatch / ELK | Debugging and monitoring |
| Access logs | 1 year | S3 archival | Security analysis |
| Error logs | 180 days | CloudWatch / ELK | Bug tracking |

**Automated archival strategy:**

```typescript
// Partition audit_logs by month for efficient archival
// PostgreSQL partitioning:
// CREATE TABLE audit_logs (
//   ...
// ) PARTITION BY RANGE (created_at);
//
// CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
//   FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
//
// Old partitions can be detached and moved to cold storage
```

---

## 5. OWASP Guidelines for Fintech Applications

### 5.1 Relevant OWASP Top 10 Items

The OWASP Top 10 (2021) items most relevant to this financial transaction microservice:

| # | Vulnerability | Relevance to Wallet Service | Mitigation |
|---|--------------|----------------------------|------------|
| **A01: Broken Access Control** | Users accessing other users' wallets/transactions | Role-based guards, ownership validation (Note: auth is out of scope for this project, but the architecture should support it) |
| **A02: Cryptographic Failures** | Sensitive data exposure in transit/rest | HTTPS, encryption at rest, proper key management |
| **A03: Injection** | SQL injection via raw queries | Prisma parameterization, input validation (covered in Section 2) |
| **A04: Insecure Design** | Race conditions, missing fraud checks | Locking strategies, fraud detection (covered in Section 3) |
| **A05: Security Misconfiguration** | Default configs, verbose errors | Hardened configs, error sanitization |
| **A06: Vulnerable Components** | Outdated dependencies with CVEs | Automated dependency scanning |
| **A07: Authentication Failures** | N/A (out of scope) | N/A |
| **A08: Data Integrity Failures** | Tampered transaction amounts | Input validation, checksums, audit trail |
| **A09: Logging Failures** | Missing audit trail | Structured logging (covered in Section 4) |
| **A10: SSRF** | Low risk for this service | Input validation on any URL parameters |

### 5.2 Rate Limiting for Transaction Endpoints

Rate limiting prevents abuse, DoS attacks, and brute-force attempts. For a financial API, different endpoints need different limits.

**NestJS rate limiting with `@nestjs/throttler`:**

```typescript
// src/app.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1_000,  // 1 second
        limit: 10,   // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 60_000, // 1 minute
        limit: 100,  // 100 requests per minute
      },
      {
        name: 'long',
        ttl: 3_600_000, // 1 hour
        limit: 1000,    // 1000 requests per hour
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

**Endpoint-specific rate limits:**

```typescript
import { Throttle, SkipThrottle } from '@nestjs/throttler';

@Controller('api/v1/transactions')
export class TransactionController {
  // Stricter limit for transaction creation
  @Post()
  @Throttle([
    { name: 'short', limit: 3, ttl: 1_000 },   // 3 per second
    { name: 'medium', limit: 30, ttl: 60_000 }, // 30 per minute
  ])
  async createTransaction(@Body() dto: CreateTransactionDto) {
    // ...
  }

  // More relaxed limit for read operations
  @Get()
  @Throttle([
    { name: 'short', limit: 20, ttl: 1_000 },
    { name: 'medium', limit: 200, ttl: 60_000 },
  ])
  async getTransactions(@Query() query: QueryTransactionsDto) {
    // ...
  }
}

@Controller('health')
export class HealthController {
  // Skip rate limiting for health checks
  @Get()
  @SkipThrottle()
  async check() {
    return { status: 'ok' };
  }
}
```

**Per-user rate limiting (when auth is implemented):**

```typescript
// Custom throttler that limits per user ID instead of per IP
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use user ID for authenticated requests, fall back to IP
    return req.user?.id || req.ip;
  }
}
```

### 5.3 Error Message Sanitization

Financial APIs must never expose internal details in error responses.

**Global exception filter:**

```typescript
// src/presentation/filters/global-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const correlationId = request['correlationId'];

    let status: number;
    let message: string;
    let errorCode: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Known application errors - safe to expose
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as any).message || 'An error occurred';
        errorCode = (exceptionResponse as any).errorCode || 'UNKNOWN_ERROR';
      } else {
        message = exception.message;
        errorCode = 'HTTP_ERROR';
      }
    } else {
      // Unknown error - DO NOT expose details
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An internal error occurred. Please try again later.';
      errorCode = 'INTERNAL_ERROR';

      // Log the full error internally
      this.logger.error(
        {
          error: exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : undefined,
          correlationId,
          path: request.url,
          method: request.method,
        },
        'Unhandled exception',
      );
    }

    // Sanitized response - never includes stack traces, SQL, or internal paths
    response.status(status).json({
      statusCode: status,
      errorCode,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
    });
  }
}
```

**What to never include in error responses:**

- Stack traces
- SQL queries or database error messages
- Internal file paths
- Server version information
- Dependency version information
- Configuration details
- Other users' data

**Safe vs. unsafe error examples:**

```typescript
// UNSAFE: Leaks database details
{
  "message": "insert into \"Transaction\" (\"userId\") values ($1) - duplicate key value violates unique constraint \"Transaction_pkey\""
}

// SAFE: Generic message with reference ID
{
  "statusCode": 409,
  "errorCode": "DUPLICATE_TRANSACTION",
  "message": "A transaction with this ID already exists",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-20T10:30:00.000Z"
}
```

### 5.4 Dependency Vulnerability Scanning

Outdated dependencies with known vulnerabilities are a primary attack vector.

**NPM audit in CI/CD:**

```yaml
# .github/workflows/security.yml
name: Security Scan
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1' # Weekly on Mondays

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm audit --audit-level=high
        continue-on-error: false # Fail the build on high/critical vulnerabilities

  snyk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high
```

**Recommended tools:**

| Tool | Purpose | Integration |
|------|---------|-------------|
| `npm audit` | Built-in vulnerability scanning | CI/CD pipeline |
| Snyk | Deep dependency analysis | GitHub integration |
| Dependabot | Automated dependency updates | GitHub native |
| Trivy | Container image scanning | Docker build pipeline |

### 5.5 HTTPS Enforcement

All communication must be encrypted in transit.

**NestJS Helmet integration for security headers:**

```typescript
// src/main.ts
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(
    helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Only if Swagger UI is needed
          imgSrc: ["'self'"],
          connectSrc: ["'self'"],
        },
      },
      // HSTS - enforce HTTPS
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      // Prevent clickjacking
      frameguard: { action: 'deny' },
      // Prevent MIME type sniffing
      noSniff: true,
      // Hide X-Powered-By
      hidePoweredBy: true,
    }),
  );

  // CORS configuration - restrictive
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://app.refacil.com'],
    methods: ['GET', 'POST', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
    credentials: true,
    maxAge: 3600,
  });

  await app.listen(3000);
}
```

### 5.6 Security Headers Summary

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `Content-Security-Policy` | `default-src 'self'` | Prevent XSS |
| `X-XSS-Protection` | `0` (disabled in favor of CSP) | Legacy XSS protection |
| `Cache-Control` | `no-store` | Prevent caching of financial data |
| `X-Correlation-Id` | `<uuid>` | Request tracing |

**Additional response headers for financial data:**

```typescript
// Middleware to prevent caching of financial data
@Injectable()
export class NoCacheMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  }
}
```

---

## 6. Recommendations for This Project

### 6.1 Priority-Ordered Security Measures

The following is a prioritized list of security measures, ordered by impact and implementation effort.

#### Priority 1: Critical (Must have before any deployment)

| # | Measure | Effort | Impact | Section |
|---|---------|--------|--------|---------|
| 1 | **Global ValidationPipe** with whitelist + forbidNonWhitelisted | 1 hour | High | 1.3 |
| 2 | **Input validation on all DTOs** with class-validator | 2-4 hours | High | 1.1 |
| 3 | **Pessimistic locking** for balance updates | 2-3 hours | Critical | 3.2 |
| 4 | **Global exception filter** to sanitize error responses | 1-2 hours | High | 5.3 |
| 5 | **Prisma-only queries** (no string concatenation in raw queries) | Review | Critical | 2.1 |
| 6 | **Correlation ID middleware** | 1 hour | Medium | 4.4 |

#### Priority 2: High (Implement in first sprint)

| # | Measure | Effort | Impact | Section |
|---|---------|--------|--------|---------|
| 7 | **Structured audit logging** with Pino | 3-4 hours | High | 4.2 |
| 8 | **Rate limiting** with @nestjs/throttler | 1-2 hours | High | 5.2 |
| 9 | **Helmet security headers** | 30 min | Medium | 5.5 |
| 10 | **Custom financial amount validator** | 1-2 hours | Medium | 1.2 |
| 11 | **PII redaction** in logs | 1 hour | High | 4.5 |
| 12 | **Domain value objects** (Money, TransactionId) | 2-3 hours | Medium | 1.5 |

#### Priority 3: Medium (Implement in second sprint)

| # | Measure | Effort | Impact | Section |
|---|---------|--------|--------|---------|
| 13 | **Immutable audit trail** (DB table + triggers) | 3-4 hours | Medium | 4.3 |
| 14 | **Dependency vulnerability scanning** in CI | 2 hours | Medium | 5.4 |
| 15 | **CORS configuration** | 30 min | Medium | 5.5 |
| 16 | **No-cache headers** for financial endpoints | 30 min | Low | 5.6 |
| 17 | **Database audit log partitioning** | 2-3 hours | Low | 4.6 |

#### Priority 4: Nice to have (Future iterations)

| # | Measure | Effort | Impact | Section |
|---|---------|--------|--------|---------|
| 18 | **Per-user rate limiting** | 2 hours | Medium | 5.2 |
| 19 | **Snyk integration** | 1 hour | Low | 5.4 |
| 20 | **Advisory locks** for high-throughput scenarios | 4-6 hours | Low | 3.4 |

### 6.2 Quick Wins vs. Longer-Term Investments

**Quick wins (can be done in under 2 hours each):**

1. **ValidationPipe global configuration** -- single file change in `main.ts`, immediately protects all endpoints
2. **Helmet middleware** -- one `npm install` and 10 lines of configuration
3. **Correlation ID middleware** -- simple middleware, enables traceability
4. **No-cache headers** -- prevents financial data caching in proxies/browsers
5. **Global exception filter** -- prevents information leakage in all error responses

**Longer-term investments:**

1. **Immutable audit trail with database triggers** -- requires careful schema design, migration strategy, and partitioning plan
2. **Comprehensive fraud detection** -- requires separate research, rule engine, machine learning pipeline
3. **End-to-end encryption** -- field-level encryption for sensitive financial data at rest
4. **Security penetration testing** -- hire external security auditors to test the deployed system
5. **SOC 2 compliance** -- if the service handles third-party financial data

### 6.3 NestJS Security Middleware and Guards

**Recommended NestJS packages for security:**

```json
{
  "dependencies": {
    "@nestjs/throttler": "^6.0.0",
    "helmet": "^8.0.0",
    "nestjs-pino": "^4.0.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.1"
  },
  "devDependencies": {
    "snyk": "^1.0.0"
  }
}
```

**Application module security setup:**

```typescript
// src/app.module.ts
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { LoggerModule } from './infrastructure/logging/logger.module';
import { CorrelationIdMiddleware } from './presentation/middleware/correlation-id.middleware';
import { NoCacheMiddleware } from './presentation/middleware/no-cache.middleware';
import { GlobalExceptionFilter } from './presentation/filters/global-exception.filter';

@Module({
  imports: [
    LoggerModule,
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1_000, limit: 10 },
      { name: 'medium', ttl: 60_000, limit: 100 },
    ]),
    // ... other modules
  ],
  providers: [
    // Global validation pipe
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
    // Global rate limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware, NoCacheMiddleware)
      .forRoutes('*');
  }
}
```

**Security checklist for code review:**

- [ ] All DTO fields have validation decorators
- [ ] No `$queryRaw` with string interpolation
- [ ] Balance updates use `SELECT FOR UPDATE` within a transaction
- [ ] Error responses do not contain stack traces or SQL
- [ ] Audit logs are written for all state changes
- [ ] No PII in log output
- [ ] Rate limiting is configured on mutation endpoints
- [ ] All new dependencies have been audited for vulnerabilities
- [ ] Correlation ID is propagated through the request lifecycle

---

## References

- [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
- [OWASP Application Security Verification Standard (ASVS)](https://owasp.org/www-project-application-security-verification-standard/)
- [NestJS Security Documentation](https://docs.nestjs.com/security/helmet)
- [Prisma Security Best Practices](https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access)
- [class-validator Documentation](https://github.com/typestack/class-validator)
- [PostgreSQL Locking Documentation](https://www.postgresql.org/docs/16/explicit-locking.html)
- [Pino Logger](https://getpino.io/)
- [NestJS Throttler](https://docs.nestjs.com/security/rate-limiting)
- [Helmet.js](https://helmetjs.github.io/)
- [Colombian Financial Regulation - Superintendencia Financiera](https://www.superfinanciera.gov.co/)
