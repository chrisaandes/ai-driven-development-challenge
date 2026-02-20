# ADR-003: Error Handling Strategy (Result Pattern)

## Status
Accepted

## Date
2026-02-20

## Context

The Refacil Wallet microservice processes financial transactions with well-defined failure modes. A withdrawal can fail due to insufficient balance. A deposit can fail due to an invalid amount. A duplicate transaction must be detected and handled gracefully. Fraud detection may flag a transaction as suspicious. Each of these is an expected business outcome, not an unexpected system crash.

TypeScript and NestJS have different error handling conventions at different layers, and these conventions conflict with each other:

1. **TypeScript's exception model loses type information**: When a function throws, the catch clause always receives `unknown` (since TypeScript 4.4). There is no way to declare in a function signature what exceptions it might throw. A caller of `wallet.withdraw(amount)` cannot know from the type system alone that this method might throw `InsufficientBalanceError` or `InvalidAmountError`. The method signature says `Promise<Transaction>`, hiding the failure modes entirely.

2. **NestJS relies on exceptions for HTTP error responses**: NestJS's built-in error handling (exception filters, HttpException subclasses) is designed around thrown exceptions. Controllers and use cases are expected to throw `NotFoundException`, `BadRequestException`, etc., which NestJS automatically maps to HTTP status codes.

3. **Domain layer must not depend on NestJS**: Per ADR-001, the domain layer has zero framework dependencies. Using `HttpException` or any NestJS-specific exception class in domain entities would violate this constraint. But if domain methods throw plain `Error` instances, the rich error context (error codes, affected entity IDs, business context) is lost.

4. **Financial operations need explicit failure handling**: In a financial system, silently catching or ignoring an error can cause monetary loss. The code must force developers to handle every failure case. An unhandled `InsufficientBalanceError` that results in an uncontrolled 500 error is unacceptable -- it should produce a precise 422 response with the current balance and requested amount.

5. **Different layers have different error-handling needs**:
   - **Domain**: Errors are data, not control flow. A failed withdrawal is a normal business outcome, not an exceptional situation. The domain should express failures as values, not as thrown exceptions.
   - **Application**: Use cases orchestrate multi-step workflows. Exceptions simplify control flow when any step can fail and the entire operation should abort.
   - **Presentation**: HTTP responses require mapping error types to status codes and structured JSON bodies.

6. **Assessment context**: The error handling strategy demonstrates the candidate's understanding of functional error handling patterns, Clean Architecture boundary translation, and production-grade API design.

## Decision

We adopt a **three-tier error handling strategy** where each architectural layer uses the error mechanism most appropriate for its concerns:

### Tier 1: Domain Layer -- Result<T, DomainError>

Domain methods that can fail return `Result<T, E>` instead of throwing exceptions. This makes failure an explicit part of the return type, forcing callers to handle it.

#### Result<T, E> Implementation

```typescript
// src/domain/common/result.ts
export class Result<T, E extends Error = Error> {
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  static ok<T>(value: T): Result<T, never> {
    return new Result<T, never>(true, value, undefined);
  }

  static fail<E extends Error>(error: E): Result<never, E> {
    return new Result<never, E>(false, undefined, error);
  }

  get isSuccess(): boolean { return this._isSuccess; }
  get isFailure(): boolean { return !this._isSuccess; }

  get value(): T {
    if (!this._isSuccess) {
      throw new Error(`Cannot access value of a failed Result. Error: ${this._error?.message}`);
    }
    return this._value as T;
  }

  get error(): E {
    if (this._isSuccess) {
      throw new Error('Cannot access error of a successful Result.');
    }
    return this._error as E;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this._isSuccess) return Result.ok(fn(this._value as T));
    return Result.fail(this._error as E);
  }

  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this._isSuccess) return fn(this._value as T);
    return Result.fail(this._error as E);
  }

  getOrElse(defaultValue: T): T {
    return this._isSuccess ? (this._value as T) : defaultValue;
  }
}
```

The `Result` class has zero external dependencies. It is a pure TypeScript discriminated union that lives in `src/domain/common/result.ts`.

Key design choices:
- `Result.ok()` returns `Result<T, never>`, meaning the error type is impossible. This helps TypeScript's type narrowing.
- `Result.fail()` returns `Result<never, E>`, meaning the value type is impossible.
- Accessing `.value` on a failed Result throws -- this is a programming error (the caller should check `.isSuccess` first), not a business error.
- `map()` and `flatMap()` enable functional composition without unwrapping.

#### Domain Errors

Each domain failure mode has its own error class with a typed `code` property:

```typescript
// src/domain/errors/insufficient-funds.error.ts
export class InsufficientFundsError extends Error {
  public readonly code = 'INSUFFICIENT_FUNDS' as const;

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

// src/domain/errors/invalid-amount.error.ts
export class InvalidAmountError extends Error {
  public readonly code = 'INVALID_AMOUNT' as const;

  constructor(public readonly reason: string) {
    super(`Invalid amount: ${reason}`);
    this.name = 'InvalidAmountError';
  }
}

// src/domain/errors/wallet-not-found.error.ts
export class WalletNotFoundError extends Error {
  public readonly code = 'WALLET_NOT_FOUND' as const;

  constructor(public readonly identifier: string) {
    super(`Wallet not found: ${identifier}`);
    this.name = 'WalletNotFoundError';
  }
}
```

#### Domain Methods Using Result

```typescript
// In Wallet entity:
withdraw(amount: Money): Result<Transaction, InsufficientFundsError | InvalidAmountError> {
  if (amount.isNegativeOrZero()) {
    return Result.fail(new InvalidAmountError('Amount must be positive'));
  }
  if (this._balance.isLessThan(amount)) {
    return Result.fail(
      new InsufficientFundsError(this._userId, amount.value, this._balance.value),
    );
  }
  this._balance = this._balance.subtract(amount);
  return Result.ok(Transaction.createWithdraw(this._id, amount, this._balance));
}
```

The return type `Result<Transaction, InsufficientFundsError | InvalidAmountError>` explicitly declares every way this method can fail. The caller sees these failure modes in their IDE and must handle them.

### Tier 2: Application Layer -- ApplicationException

The application layer translates domain Results into exceptions that carry HTTP-compatible metadata. This is the **boundary translation point** between functional error handling (domain) and exception-based error handling (NestJS).

```typescript
// src/application/exceptions/application.exception.ts
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
    return new ApplicationException(ApplicationErrorCode.BAD_REQUEST, message);
  }

  static unprocessable(message: string, details?: Record<string, unknown>): ApplicationException {
    return new ApplicationException(
      ApplicationErrorCode.UNPROCESSABLE_ENTITY,
      message,
      details,
    );
  }

  /**
   * Translates a domain error into an ApplicationException.
   * This is the boundary between Result-based and exception-based error handling.
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

    if (error instanceof InvalidAmountError) {
      return ApplicationException.badRequest(error.message);
    }

    if (error instanceof WalletNotFoundError) {
      return ApplicationException.notFound('Wallet', error.identifier);
    }

    // Unknown domain errors become internal errors
    return new ApplicationException(
      ApplicationErrorCode.INTERNAL_ERROR,
      error.message,
    );
  }
}
```

#### Use Case Boundary Translation

```typescript
// src/application/use-cases/process-transaction.use-case.ts
@Injectable()
export class ProcessTransactionUseCase {
  async execute(input: ProcessTransactionInput): Promise<ProcessTransactionOutput> {
    // ... wallet lookup, idempotency check ...

    // Domain operation returns Result
    const result = input.type === 'DEPOSIT'
      ? wallet.deposit(amount)
      : wallet.withdraw(amount);

    // Boundary translation: Result.fail -> ApplicationException
    if (result.isFailure) {
      throw ApplicationException.fromDomainError(result.error);
    }

    // Result.ok -> continue with value
    const transaction = result.value;

    // ... persistence, event publishing ...
  }
}
```

The `if (result.isFailure)` check is the exact point where the error handling paradigm shifts from functional (Result) to imperative (throw). This happens at the application layer boundary, not inside the domain.

### Tier 3: Presentation Layer -- GlobalExceptionFilter

The presentation layer catches all exceptions and maps them to structured HTTP responses. No error handling logic exists in controllers.

```typescript
// src/presentation/filters/global-exception.filter.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  private static readonly ERROR_CODE_TO_HTTP_STATUS: Record<ApplicationErrorCode, HttpStatus> = {
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

    if (exception instanceof ApplicationException) {
      const status = GlobalExceptionFilter.ERROR_CODE_TO_HTTP_STATUS[exception.code]
        ?? HttpStatus.INTERNAL_SERVER_ERROR;
      response.status(status).json({
        statusCode: status,
        error: exception.code,
        message: exception.message,
        details: exception.details,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
      return;
    }

    if (exception instanceof HttpException) {
      // NestJS validation errors, etc.
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      response.status(status).json({
        statusCode: status,
        error: typeof exceptionResponse === 'object'
          ? (exceptionResponse as Record<string, unknown>).error
          : exceptionResponse,
        message: typeof exceptionResponse === 'object'
          ? (exceptionResponse as Record<string, unknown>).message
          : exception.message,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
      return;
    }

    // Unexpected errors -- log full details, return sanitized response
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

### Complete Error Flow Diagram

```
Client                 Presentation           Application              Domain
──────                 ────────────           ───────────              ──────
POST /transactions
  amount: 500.00
  type: withdraw
                       Controller             UseCase                  Wallet.withdraw()
                       delegates  ──────>     calls domain  ──────>   balance: 100.00
                                                                      amount: 500.00
                                                                      |
                                                                      v
                                                                      balance < amount
                                                                      |
                                                                      v
                                                                      Result.fail(
                                                                        InsufficientFundsError
                                                                      )
                                              <──────────────────────
                                              result.isFailure === true
                                              |
                                              v
                                              throw ApplicationException(
                                                UNPROCESSABLE_ENTITY,
                                                "Insufficient funds...",
                                                { availableBalance: 100,
                                                  requestedAmount: 500 }
                                              )
                       <──────────────────────
                       GlobalExceptionFilter
                       catches ApplicationException
                       maps UNPROCESSABLE_ENTITY -> 422
                       |
                       v
<──────────────────────
HTTP 422
{
  "statusCode": 422,
  "error": "UNPROCESSABLE_ENTITY",
  "message": "Insufficient funds...",
  "details": {
    "code": "INSUFFICIENT_FUNDS",
    "availableBalance": 100,
    "requestedAmount": 500
  },
  "timestamp": "2026-02-20T...",
  "path": "/api/v1/transactions"
}
```

### Error Handling Summary by Layer

| Layer | Mechanism | Example | Rationale |
|-------|-----------|---------|-----------|
| **Domain** | `Result<T, DomainError>` | `wallet.withdraw()` returns `Result.fail(InsufficientFundsError)` | Errors are values. No hidden control flow. Type-safe. Testable without catch blocks. |
| **Application** | `throw ApplicationException` | `throw ApplicationException.fromDomainError(result.error)` | Exceptions simplify multi-step orchestration. Carries error code + details for HTTP mapping. |
| **Presentation** | `GlobalExceptionFilter` | Catches `ApplicationException`, maps to 422 JSON | Centralized. Controllers stay thin. No error handling in request handlers. |
| **Infrastructure** | Let errors propagate | Prisma connection error -> unhandled -> 500 | Infrastructure failures are truly exceptional. Global filter returns generic 500. Full details logged internally. |

## Alternatives Considered

### Alternative 1: Throw Exceptions Everywhere

Use NestJS's built-in exception model throughout. Domain methods throw `HttpException` subclasses. No Result pattern.

```typescript
// Domain entity throws HTTP exception directly
withdraw(amount: Money): Transaction {
  if (this._balance.isLessThan(amount)) {
    throw new UnprocessableEntityException('Insufficient funds');
  }
  // ...
}
```

**Pros**:
- Simplest possible implementation
- NestJS-native, no custom error handling infrastructure
- Familiar to all NestJS developers
- Less code (no Result class, no boundary translation)
- NestJS's built-in exception filter handles everything automatically

**Cons**:
- Domain layer depends on `@nestjs/common` (imports `UnprocessableEntityException`), violating ADR-001's zero-dependency constraint
- Impossible to express failure modes in the type signature. `withdraw()` returns `Transaction` but might throw -- the caller cannot know this from the type alone
- Domain logic becomes untestable without NestJS's test module (must catch specific HTTP exceptions)
- Mixing HTTP concepts (status codes, "Unprocessable Entity") into domain logic. The domain should not know about HTTP
- Error details (available balance, requested amount) require ad-hoc object construction in each throw site, with no consistent structure
- Silent failures: if a developer forgets to catch a domain error, it bubbles up as an uncontrolled 500 instead of a precise 422

**Why rejected**: The coupling of domain logic to HTTP exceptions is architecturally unacceptable for a financial service. The domain concept "insufficient balance" should not be expressed as "HTTP 422 Unprocessable Entity" at the point where the business rule is enforced. The lack of type-safe error signatures means failure modes are invisible to callers, which is dangerous in financial code.

### Alternative 2: Result Pattern Everywhere (Including Application Layer)

Use `Result<T, E>` in the application layer as well. Use cases return Result instead of throwing. Controllers unwrap Results and generate HTTP responses.

```typescript
// Use case returns Result
async execute(input: Input): Promise<Result<Output, ApplicationError>> {
  const wallet = await this.walletRepo.findByUserId(input.userId);
  if (!wallet) return Result.fail(new NotFoundError('Wallet', input.userId));

  const domainResult = wallet.withdraw(amount);
  if (domainResult.isFailure) return Result.fail(domainResult.error);

  await this.repo.save(wallet);
  return Result.ok(output);
}

// Controller unwraps Result
@Post()
async process(@Body() dto: CreateTransactionDto): Promise<TransactionResponse> {
  const result = await this.useCase.execute(dto);
  if (result.isFailure) {
    throw this.mapToHttpException(result.error);
  }
  return result.value;
}
```

**Pros**:
- Maximum type safety: every layer's failure modes are visible in return types
- No exceptions in business logic at all
- Functional programming purists approve
- Easier to compose use cases (one use case calling another can chain Results)

**Cons**:
- Controllers become fat: every controller method must check `result.isFailure` and map to HTTP exceptions. This duplicates the error-mapping logic that the GlobalExceptionFilter already handles centrally
- NestJS's `@HttpCode()`, `@ApiResponse()`, and other decorators expect methods to either return successfully or throw. Returning a Result breaks these conventions
- NestJS interceptors, guards, and pipes expect exception-based control flow. A Result-based approach bypasses the entire NestJS error handling pipeline
- Verbose: every use case method wraps return values in `Result.ok()`, and every caller must unwrap. For a multi-step use case with 5 operations, the boilerplate is significant
- The "fail fast" semantics of exceptions are lost. With Results, each step must be explicitly checked before proceeding to the next. This is correct but verbose

**Why rejected**: The additional ceremony at the application-to-presentation boundary does not justify itself. NestJS's exception-based error handling (GlobalExceptionFilter) already provides centralized, consistent HTTP error mapping. Fighting this convention adds complexity without proportional benefit. The Result pattern is most valuable in the domain layer where type-safe failure representation matters most; in the application layer, exceptions provide cleaner orchestration.

### Alternative 3: Either Monad (fp-ts Library)

Use `fp-ts`'s `Either<E, A>` (left = error, right = success) and `TaskEither<E, A>` (async Either) throughout. Full functional programming approach with pipe, chain, and fold operators.

```typescript
import { pipe } from 'fp-ts/function';
import { TaskEither, chain, fold } from 'fp-ts/TaskEither';
import { either } from 'fp-ts';

const withdraw = (wallet: Wallet, amount: Money): Either<DomainError, Transaction> =>
  wallet.balance.isLessThan(amount)
    ? either.left(new InsufficientFundsError(...))
    : either.right(Transaction.create(...));

const processTransaction = (input: Input): TaskEither<AppError, Output> =>
  pipe(
    findWallet(input.userId),
    chain(wallet => withdraw(wallet, Money.of(input.amount))),
    chain(tx => saveTransaction(tx)),
    chain(tx => publishEvents(tx)),
  );
```

**Pros**:
- Most powerful and composable error handling model
- Referential transparency: functions never throw, always return values
- `pipe` and `chain` enable elegant composition of fallible operations
- Well-established pattern from Haskell, Scala, and Rust communities
- Forces exhaustive error handling at every step

**Cons**:
- Extremely steep learning curve. `fp-ts` introduces `pipe`, `flow`, `chain`, `fold`, `map`, `mapLeft`, `TaskEither`, `ReaderTaskEither`, and dozens of other combinators. Most TypeScript/NestJS developers have never used these concepts
- Non-standard in the NestJS ecosystem. Every NestJS tutorial, example, and community library uses imperative exception-based patterns. Using `fp-ts` creates a language barrier for other developers
- NestJS integration is awkward. Controllers must `fold` the Either to extract the value or throw. NestJS's DI, interceptors, and guards do not understand TaskEither
- Bundle size: `fp-ts` adds significant dependency weight and compile-time overhead
- Debugging is harder: stack traces from piped functions are less informative than imperative code
- AI agents (which implement this codebase) may produce incorrect `fp-ts` code due to the library's complex type signatures

**Why rejected**: The power of `fp-ts` is disproportionate to the project's needs. A simple `Result<T, E>` class (50 lines of code) provides 80% of the benefit at 5% of the complexity. The learning curve and ecosystem friction make `fp-ts` a poor choice for a project where multiple AI agents need to produce consistent, idiomatic NestJS code.

### Alternative 4: Neverthrow Library

Use the `neverthrow` npm package, which provides a well-tested `Result` and `ResultAsync` implementation similar to Rust's `Result` type.

```typescript
import { ok, err, Result, ResultAsync } from 'neverthrow';

const withdraw = (wallet: Wallet, amount: Money): Result<Transaction, DomainError> =>
  wallet.balance.isLessThan(amount)
    ? err(new InsufficientFundsError(...))
    : ok(Transaction.create(...));
```

**Pros**:
- Production-tested Result implementation with `map`, `mapErr`, `andThen`, `match`, `unwrapOr`
- `ResultAsync` for promise-based Results (avoids `Promise<Result<T, E>>` nesting)
- Well-documented with TypeScript examples
- Smaller and simpler than `fp-ts`
- Active maintenance and community

**Cons**:
- Adds an external dependency to the domain layer. Per ADR-001, the domain layer should have zero external dependencies. Even a small, well-tested library like `neverthrow` is an external dependency that could have breaking changes, security vulnerabilities, or abandoned maintenance
- The API surface (`ok`, `err`, `Result`, `ResultAsync`, `fromPromise`, `fromThrowable`) introduces concepts that are not necessary for our use case
- Minor: naming differs from our research documents and architecture guidelines, which use `Result.ok()` and `Result.fail()` (our custom implementation)

**Why rejected**: The primary reason is the domain layer's zero-dependency constraint. A custom `Result<T, E>` class is approximately 50 lines of code, well within the scope of what we can write, test, and maintain ourselves. The `neverthrow` library would be the right choice if the domain layer were allowed external dependencies, but that constraint is non-negotiable for this architecture.

## Consequences

### Positive

- **Domain methods are honest about failure**: The type signature `withdraw(amount: Money): Result<Transaction, InsufficientFundsError | InvalidAmountError>` tells the caller exactly what can go wrong. This is self-documenting and compiler-enforced.

- **Domain is testable without catch blocks**: Unit tests for domain methods check `result.isSuccess` and `result.error.code` rather than wrapping everything in try/catch. This makes tests more readable and less prone to accidentally passing when exceptions are not thrown.

  ```typescript
  // Clean test without try/catch
  const result = wallet.withdraw(Money.of(500));
  expect(result.isFailure).toBe(true);
  expect(result.error).toBeInstanceOf(InsufficientFundsError);
  expect(result.error.availableBalance).toBe(100);
  ```

- **Centralized error-to-HTTP mapping**: The `GlobalExceptionFilter` and `ApplicationException.fromDomainError()` are the only two places where error translation happens. Adding a new domain error requires adding one case to `fromDomainError()` and possibly one entry to the HTTP status mapping. No other code needs to change.

- **Clear error flow**: The error propagation path (domain Result -> application throw -> presentation catch) is well-defined and auditable. During code review, it is easy to trace how a domain failure becomes an HTTP response.

- **Consistent API error responses**: Every error response follows the same JSON structure (`statusCode`, `error`, `message`, `details`, `timestamp`, `path`). This is documented in the Swagger/OpenAPI spec and the tech stack guidelines.

### Negative

- **Result wrapping adds verbosity**: Every domain method that can fail must return `Result<T, E>` and every caller must check `isFailure` before accessing `.value`. For a method chain with multiple fallible operations, this creates a pyramid of `if (result.isFailure)` checks. The `flatMap()` method mitigates this for simple chains, but complex orchestration still requires explicit checking.

- **Developers must understand the Result pattern**: The pattern is not standard in the NestJS ecosystem. Developers new to the project must learn when to return Result (domain) vs. when to throw (application). The boundary between these two paradigms must be documented and enforced in code reviews.

- **Boundary translation is boilerplate**: The `ApplicationException.fromDomainError()` method contains a series of `if (error instanceof X)` checks that map domain errors to application errors. Each new domain error type requires a new case. This is repetitive but necessary.

- **Two paradigms in one codebase**: The coexistence of Result-based and exception-based error handling means developers must mentally switch between paradigms depending on which layer they are working in. This cognitive overhead is the price of respecting each layer's natural error handling convention.

### Risks

- **Incomplete Result checking**: If a developer accesses `result.value` without checking `result.isSuccess` first, the Result class throws a programming error. This is caught at runtime, not compile time. **Mitigation**: TypeScript's strict mode combined with the discriminated union pattern provides some compile-time protection. Additionally, a custom ESLint rule could flag unchecked Result access.

- **New domain errors not mapped in fromDomainError()**: If a developer adds a new domain error class but forgets to add a mapping in `ApplicationException.fromDomainError()`, the error falls through to the "unknown domain error" fallback, producing a generic 500 response instead of a precise 4xx. **Mitigation**: The test suite for `fromDomainError()` should include a case for every domain error class. A CI check could verify coverage.

- **Exception swallowing in event handlers**: If an EventEmitter2 event handler throws, the exception may not propagate to the original request. **Mitigation**: Event handlers should catch their own exceptions and log them. The main transaction processing should succeed even if a side-effect (like fraud analysis) fails.

## References

- Wlaschin, Scott. "Railway Oriented Programming." https://fsharpforfunandprofit.com/rop/
- Rust Programming Language: Error Handling. https://doc.rust-lang.org/book/ch09-00-error-handling.html
- NestJS Documentation: Exception Filters. https://docs.nestjs.com/exception-filters
- TypeScript 4.4: Unknown catch clause variables. https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-4.html
- Research document: `docs/research/01-architecture-patterns.md` -- Error handling strategies (Section 3)
- Architecture guidelines: `.claude/steering/architecture.md` -- Error handling by layer
