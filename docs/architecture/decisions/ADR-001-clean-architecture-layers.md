# ADR-001: Clean Architecture Layer Separation

## Status
Accepted

## Date
2026-02-20

## Context

We are building a financial transaction microservice (the Refacil Wallet) that processes deposits, withdrawals, balance queries, and fraud detection for a digital wallet ecosystem. Several forces shape the architectural decision:

1. **Financial domain complexity**: Business rules around balance validation, transaction atomicity, idempotency, and fraud detection are intricate. These rules must be testable in isolation, without spinning up a database or HTTP server. If domain logic is coupled to NestJS controllers or Prisma ORM calls, unit testing becomes slow, fragile, and dependent on infrastructure.

2. **Parallel development by multiple agents**: The project uses an AI-driven development methodology where multiple specialized agents (domain-dev, application-dev, infrastructure-dev, api-dev) work on different parts of the codebase simultaneously. Clear, enforced boundaries between layers minimize merge conflicts and allow each agent to work independently against well-defined interfaces.

3. **Framework independence for the core domain**: The wallet domain model -- wallets, transactions, money, fraud rules -- represents long-lived business concepts. The NestJS framework and Prisma ORM are implementation choices that may evolve. Coupling the domain to `@Injectable()` decorators, `@nestjs/common` imports, or `@prisma/client` types would make future framework migration prohibitively expensive.

4. **Regulatory and audit requirements**: Financial systems in Colombia (Superintendencia Financiera) require demonstrable separation of concerns, clear audit trails, and testable business rules. An architecture that can prove correctness of domain logic independently from infrastructure strengthens compliance posture.

5. **Assessment context**: This project is a technical assessment for a Senior Engineer position at Refacil. The architecture must demonstrate deliberate, well-reasoned design decisions -- not just a "NestJS default" folder structure.

6. **Performance target of 1,000 TPS**: The system must handle peak loads of 1,000 transactions per second. The architecture must not introduce unnecessary abstraction overhead in the critical transaction processing path while maintaining clear boundaries.

## Decision

We adopt **Clean Architecture (Ports and Adapters)** with four distinct layers. Dependencies flow strictly inward: outer layers depend on inner layers, never the reverse. The domain layer sits at the center with zero external dependencies.

### Layer 1: Domain (Innermost)

**Location**: `src/domain/`

**Contents**:
- `entities/` -- Rich domain objects with behavior (Wallet, Transaction, FraudAlert)
- `value-objects/` -- Immutable typed values (Money)
- `interfaces/` -- Repository ports and service abstractions (IWalletRepository, ITransactionRepository, IFraudAlertRepository, IFraudRule)
- `services/` -- Domain services for logic spanning multiple entities (FraudAnalysisService)
- `events/` -- Domain events (TransactionCompletedEvent, WalletCreatedEvent)
- `errors/` -- Domain-specific error types (InsufficientFundsError, WalletNotFoundError, InvalidAmountError)
- `common/` -- Shared domain primitives (Result<T, E>)

**Constraints**:
- ZERO imports from `@nestjs/*`, `@prisma/*`, or any framework package
- No `@Injectable()` or other framework decorators
- Only pure TypeScript and standard library (`crypto.randomUUID()`)
- Entities use private constructors with `create()` (factory) and `reconstitute()` (hydration) static methods
- All domain methods that can fail return `Result<T, DomainError>` instead of throwing exceptions

**Example -- Wallet entity enforcing business rules**:

```typescript
// src/domain/entities/wallet.entity.ts
export class Wallet {
  private constructor(
    private readonly _id: string,
    private readonly _userId: string,
    private _balance: Money,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static create(userId: string): Wallet {
    return new Wallet(
      crypto.randomUUID(),
      userId,
      Money.zero(),
      new Date(),
      new Date(),
    );
  }

  static reconstitute(props: WalletProps): Wallet {
    return new Wallet(
      props.id, props.userId,
      Money.of(props.balance),
      props.createdAt, props.updatedAt,
    );
  }

  deposit(amount: Money): Result<Transaction, DomainError> {
    if (amount.isNegativeOrZero()) {
      return Result.fail(new InvalidAmountError('Amount must be positive'));
    }
    this._balance = this._balance.add(amount);
    this._updatedAt = new Date();
    return Result.ok(Transaction.createDeposit(this._id, amount, this._balance));
  }

  withdraw(amount: Money): Result<Transaction, DomainError> {
    if (amount.isNegativeOrZero()) {
      return Result.fail(new InvalidAmountError('Amount must be positive'));
    }
    if (this._balance.isLessThan(amount)) {
      return Result.fail(
        new InsufficientBalanceError(this._balance, amount),
      );
    }
    this._balance = this._balance.subtract(amount);
    this._updatedAt = new Date();
    return Result.ok(Transaction.createWithdraw(this._id, amount, this._balance));
  }
}
```

### Layer 2: Application

**Location**: `src/application/`

**Contents**:
- `use-cases/` -- Single-purpose orchestrators (ProcessTransactionUseCase, GetBalanceUseCase, GetTransactionHistoryUseCase)
- `dtos/` -- Data transfer objects for use case input/output
- `services/` -- Application-level services (FraudDetectionService)
- `event-handlers/` -- Handlers for domain events (FraudCheckHandler, AuditLogHandler)
- `exceptions/` -- Application-level exceptions (ApplicationException, OptimisticLockException)
- `common/` -- Shared utilities (retry logic)

**Constraints**:
- MAY import from `@nestjs/common` (for `@Injectable()`, `@Inject()`)
- MAY import from domain layer
- MUST NOT import from infrastructure or presentation layers
- Translates domain `Result` failures into `ApplicationException` with typed error codes
- Orchestrates use case flow: idempotency check, domain operation, persistence, event publishing

**Example -- Use case orchestration**:

```typescript
// src/application/use-cases/process-transaction.use-case.ts
@Injectable()
export class ProcessTransactionUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.WALLET_REPOSITORY)
    private readonly walletRepository: IWalletRepository,
    @Inject(INJECTION_TOKENS.TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(input: ProcessTransactionInput): Promise<ProcessTransactionOutput> {
    // 1. Idempotency check
    const existing = await this.transactionRepository.findByIdempotencyKey(input.transactionId);
    if (existing) return TransactionMapper.toOutput(existing);

    // 2. Get or create wallet
    let wallet = await this.walletRepository.findByUserId(input.userId);
    if (!wallet && input.type === 'DEPOSIT') {
      wallet = Wallet.create(input.userId);
    }
    if (!wallet) throw ApplicationException.notFound('Wallet', input.userId);

    // 3. Domain operation (returns Result, not exception)
    const amount = Money.of(input.amount);
    const result = input.type === 'DEPOSIT'
      ? wallet.deposit(amount)
      : wallet.withdraw(amount);

    if (result.isFailure) {
      throw ApplicationException.fromDomainError(result.error);
    }

    // 4. Persist atomically
    await this.transactionRepository.saveWithWalletUpdate(result.value, wallet);

    // 5. Publish domain events (after successful persistence)
    this.eventEmitter.emit('transaction.completed', /* event */);

    return TransactionMapper.toOutput(result.value);
  }
}
```

### Layer 3: Infrastructure (Outermost, Adapters)

**Location**: `src/infrastructure/`

**Contents**:
- `database/` -- PrismaService with lifecycle hooks and health checks
- `repositories/` -- Prisma-based implementations of domain repository interfaces (PrismaWalletRepository, PrismaTransactionRepository, PrismaFraudAlertRepository)
- `config/` -- Configuration module
- `services/` -- External service integrations (future: notification services, external fraud APIs)

**Constraints**:
- Implements domain interfaces (ports) -- depends inward on domain
- MAY import from `@nestjs/*` and `@prisma/client`
- MUST NOT be imported by domain or application layers
- Registered in NestJS DI via interface tokens (e.g., `provide: INJECTION_TOKENS.WALLET_REPOSITORY, useClass: PrismaWalletRepository`)
- Uses the reconstitute pattern to hydrate domain entities from Prisma records

**Example -- Repository implementing domain port**:

```typescript
// src/infrastructure/repositories/prisma-wallet.repository.ts
@Injectable()
export class PrismaWalletRepository implements IWalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<Wallet | null> {
    const record = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!record) return null;
    return Wallet.reconstitute({
      id: record.id,
      userId: record.userId,
      balance: record.balance,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findByIdWithLock(walletId: string): Promise<Wallet | null> {
    const [data] = await this.prisma.$queryRaw<WalletRecord[]>`
      SELECT * FROM wallets WHERE id = ${walletId} FOR UPDATE
    `;
    if (!data) return null;
    return Wallet.reconstitute({ /* ... */ });
  }
}
```

### Layer 4: Presentation (Outermost, Interface Adapters)

**Location**: `src/presentation/`

**Contents**:
- `controllers/` -- NestJS REST controllers (TransactionController, WalletController, FraudController, HealthController)
- `filters/` -- Global exception filter that maps ApplicationException to HTTP responses
- `middleware/` -- CorrelationId middleware, NoCache middleware
- `decorators/` -- Custom decorators (if needed)

**Constraints**:
- MAY import from application layer (use cases and DTOs)
- MUST NOT import from domain or infrastructure layers directly
- Controllers are thin: delegate entirely to use cases
- Request DTOs use `class-validator` decorators for input validation
- Response DTOs use `@nestjs/swagger` decorators for API documentation
- The GlobalExceptionFilter maps ApplicationErrorCode to HTTP status codes

**Example -- Thin controller**:

```typescript
// src/presentation/controllers/transaction.controller.ts
@ApiTags('Transactions')
@Controller('api/v1/transactions')
export class TransactionController {
  constructor(
    private readonly processTransaction: ProcessTransactionUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Process a financial transaction' })
  async process(@Body() dto: CreateTransactionRequestDto): Promise<TransactionResponseDto> {
    const result = await this.processTransaction.execute({
      transactionId: dto.transaction_id,
      userId: dto.user_id,
      amount: dto.amount,
      type: dto.type.toUpperCase() as 'DEPOSIT' | 'WITHDRAW',
      timestamp: new Date(dto.timestamp),
    });
    return TransactionResponseDto.fromUseCaseOutput(result);
  }
}
```

### NestJS Module Wiring

The modules are organized to respect the dependency rule:

```typescript
// InfrastructureModule (@Global) -- binds ports to adapters
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: INJECTION_TOKENS.WALLET_REPOSITORY, useClass: PrismaWalletRepository },
    { provide: INJECTION_TOKENS.TRANSACTION_REPOSITORY, useClass: PrismaTransactionRepository },
  ],
  exports: [PrismaService, INJECTION_TOKENS.WALLET_REPOSITORY, INJECTION_TOKENS.TRANSACTION_REPOSITORY],
})
export class InfrastructureModule {}

// ApplicationModule -- provides use cases
@Module({
  providers: [ProcessTransactionUseCase, GetBalanceUseCase, GetTransactionHistoryUseCase],
  exports: [ProcessTransactionUseCase, GetBalanceUseCase, GetTransactionHistoryUseCase],
})
export class ApplicationModule {}

// PresentationModule -- provides controllers
@Module({
  imports: [ApplicationModule],
  controllers: [TransactionController, WalletController, FraudController, HealthController],
})
export class PresentationModule {}

// AppModule -- composition root
@Module({
  imports: [EventEmitterModule.forRoot(), InfrastructureModule, PresentationModule],
})
export class AppModule {}
```

## Alternatives Considered

### Alternative 1: Traditional Layered Architecture (Controller -> Service -> Repository)

The NestJS default pattern where controllers call services, which call repositories. All within `feature/` modules (e.g., `transactions/transactions.service.ts`, `transactions/transactions.controller.ts`).

**Pros**:
- Simpler to set up, fewer files
- Familiar to most NestJS developers
- Less boilerplate (no interface tokens, no reconstitute pattern)
- Faster initial development velocity
- Aligns with NestJS official documentation examples

**Cons**:
- Business logic is tightly coupled to NestJS `@Injectable()` decorators and Prisma types
- Services often become "god classes" mixing orchestration, validation, and persistence
- Testing requires mocking NestJS internals and Prisma client
- No clear boundary prevents a controller from directly calling a repository
- Domain concepts (Money, balance validation) get scattered across service methods
- Difficult to enforce the "no negative balance" invariant at a single point
- Does not demonstrate architectural thinking for the assessment context

**Why rejected**: For a financial microservice handling real money, business rules must be provably correct independent of the framework. A service that imports `PrismaService` directly cannot be tested without mocking the entire Prisma client, making tests brittle and unreliable. The cost of additional files is justified by the testability and correctness guarantees.

### Alternative 2: Pure Hexagonal Architecture

A stricter Ports and Adapters implementation where every external dependency (including NestJS itself) is behind a port. The application core has absolutely no framework imports. Use cases are plain classes instantiated manually or through a custom DI container.

**Pros**:
- Maximum framework independence
- Application layer is also free of NestJS decorators
- Theoretically portable to Express, Fastify, or any other framework with zero changes
- Purist Clean Architecture adherence

**Cons**:
- Fights NestJS's module system and DI container
- Cannot use `@Injectable()` or `@Inject()` in use cases, requiring manual wiring
- Loses NestJS lifecycle hooks, middleware integration, and testing utilities
- Significantly more boilerplate for wiring layers together
- The team would maintain two DI systems (NestJS's and a custom one)
- NestJS's testing module (`Test.createTestingModule()`) becomes unusable for use case tests
- Diminishing returns: the domain layer (where purity matters most) is already framework-free

**Why rejected**: The pragmatic approach is to keep the domain layer pure but allow the application layer to use NestJS's DI system. Use cases decorated with `@Injectable()` can still be tested with `Test.createTestingModule()` using mock providers, which is both ergonomic and fast. The marginal benefit of making use cases also framework-free does not justify the integration pain.

### Alternative 3: Feature-Based Modules (NestJS Default)

Organize by feature rather than by layer: `src/transactions/`, `src/wallets/`, `src/fraud/`. Each feature module contains its own controller, service, entity, and repository.

**Pros**:
- High cohesion within each feature
- Easy to navigate (all transaction-related code in one folder)
- Aligns with NestJS community conventions
- Each feature can be developed and deployed independently (if split into microservices later)
- Fewer cross-module imports

**Cons**:
- Domain logic gets scattered across feature modules
- Shared domain concepts (Money value object, Result pattern) have no natural home
- Cross-feature business rules (e.g., fraud detection examining transactions across wallets) require awkward cross-module dependencies
- No enforcement of the dependency rule -- a controller could easily import from a repository directly
- Parallel agent development is harder: the "domain-dev" agent would need to touch files in every feature module
- The `Wallet` entity and `Transaction` entity have a strong relationship that cuts across feature boundaries

**Why rejected**: For a microservice with a single bounded context (wallet transactions), feature-based modules fragment the domain model. The wallet and transaction entities are deeply intertwined (a deposit modifies the wallet balance and creates a transaction atomically). Splitting them into separate feature modules introduces artificial boundaries within a single aggregate. Layer-based organization better reflects the actual dependency structure.

## Consequences

### Positive

- **Strong testability**: Domain entities and value objects can be tested with pure unit tests (no mocks, no DI, sub-millisecond execution). The `Wallet.withdraw()` method can be tested by simply constructing a Wallet and calling the method -- no database, no HTTP server, no NestJS test module.
- **Framework independence for business rules**: If NestJS releases a breaking major version or is superseded by a better framework, only the application, infrastructure, and presentation layers need to change. The domain layer (where the most critical financial logic lives) remains untouched.
- **Clear boundaries for parallel development**: Each agent works within a well-defined layer. The domain-dev agent writes entities and interfaces. The infrastructure-dev agent implements those interfaces with Prisma. The api-dev agent builds controllers that call use cases. Merge conflicts are minimized because each layer is in a separate directory tree.
- **Enforced invariants**: Business rules like "balance must never go negative" are enforced at exactly one point (the `Wallet.withdraw()` method) rather than scattered across services and controllers. This makes auditing and code review tractable.
- **Dependency inversion via ports**: The domain defines what it needs (IWalletRepository) without knowing how it is implemented. This enables swapping Prisma for another ORM, or replacing PostgreSQL with another database, by changing only the infrastructure layer.

### Negative

- **More files and directories**: The four-layer structure creates more files than a traditional NestJS application. A simple CRUD operation touches at minimum 4-5 files (entity, repository interface, repository implementation, use case, controller) compared to 2-3 in a traditional setup.
- **Boilerplate at layer boundaries**: The reconstitute pattern (mapping Prisma records to domain entities and back) adds mapping code in every repository. This is repetitive but necessary to keep the domain layer free of Prisma types.
- **Learning curve**: Developers familiar with NestJS's service-based pattern need to understand the dependency rule, Result pattern, and port/adapter separation. Code reviews must enforce layer boundaries that are not checked by the TypeScript compiler.
- **Injection token management**: String-based DI tokens (INJECTION_TOKENS.WALLET_REPOSITORY) add a layer of indirection. A typo in a token string causes a runtime error rather than a compile-time error, although centralized constants mitigate this.

### Risks

- **Layer boundary erosion over time**: Without automated enforcement (ESLint rules, dependency-cruiser), developers may introduce shortcuts that violate the dependency rule (e.g., a use case directly importing PrismaService). **Mitigation**: Add an ESLint rule or dependency-cruiser configuration that flags imports crossing layer boundaries in the wrong direction.
- **Over-engineering for scope**: This architecture is heavier than necessary for a simple CRUD application. If the project scope does not grow beyond basic transactions, the additional structure may feel excessive. **Mitigation**: The scope already includes fraud detection, idempotency, pessimistic locking, and event-driven side effects -- complex enough to justify the architecture.
- **Performance overhead from entity mapping**: The reconstitute/toPersistence mapping adds CPU cycles on every database operation. **Mitigation**: Profiling shows this overhead is negligible (microseconds) compared to database round-trip time (milliseconds). For the 1,000 TPS target, this is not a bottleneck.

## References

- Martin, Robert C. "Clean Architecture: A Craftsman's Guide to Software Structure and Design." Prentice Hall, 2017.
- Cockburn, Alistair. "Hexagonal Architecture." https://alistair.cockburn.us/hexagonal-architecture/
- NestJS Documentation: Custom Providers. https://docs.nestjs.com/fundamentals/custom-providers
- NestJS Documentation: Modules. https://docs.nestjs.com/modules
- Research document: `docs/research/01-architecture-patterns.md` -- Layer separation analysis for this project
- Executive summary: `docs/research/00-executive-summary.md` -- Cross-cutting architectural decisions
