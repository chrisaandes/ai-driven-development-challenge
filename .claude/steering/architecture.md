# Clean Architecture Guidelines

## Layer Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION                             │
│  Controllers, Filters, Decorators, Request/Response DTOs    │
├─────────────────────────────────────────────────────────────┤
│                     APPLICATION                              │
│  Use Cases, Application Services, Application DTOs          │
├─────────────────────────────────────────────────────────────┤
│                       DOMAIN                                 │
│  Entities, Value Objects, Domain Services, Repository Ports │
├─────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE                            │
│  Repository Implementations, Database, External Services    │
└─────────────────────────────────────────────────────────────┘

Dependency Direction: Outer → Inner (NEVER the reverse)
```

---

## Domain Layer (Innermost)

### Purpose
Contains enterprise business rules. This layer has NO dependencies on any other layer or external libraries.

### Contents

#### Entities
Rich domain objects with behavior (not anemic).

```typescript
// src/domain/entities/wallet.entity.ts
export class Wallet {
  private constructor(
    private readonly _id: string,
    private readonly _userId: string,
    private _balance: Money,
  ) {}

  static create(userId: string): Wallet {
    return new Wallet(
      crypto.randomUUID(),
      userId,
      Money.zero(),
    );
  }

  static reconstitute(id: string, userId: string, balance: Money): Wallet {
    return new Wallet(id, userId, balance);
  }

  get id(): string { return this._id; }
  get userId(): string { return this._userId; }
  get balance(): Money { return this._balance; }

  deposit(amount: Money): Result<Transaction, DomainError> {
    if (amount.isNegativeOrZero()) {
      return Result.fail(new InvalidAmountError('Amount must be positive'));
    }
    this._balance = this._balance.add(amount);
    return Result.ok(Transaction.createDeposit(this._id, amount, this._balance));
  }

  withdraw(amount: Money): Result<Transaction, DomainError> {
    if (amount.isNegativeOrZero()) {
      return Result.fail(new InvalidAmountError('Amount must be positive'));
    }
    if (this._balance.isLessThan(amount)) {
      return Result.fail(new InsufficientBalanceError(this._balance, amount));
    }
    this._balance = this._balance.subtract(amount);
    return Result.ok(Transaction.createWithdraw(this._id, amount, this._balance));
  }
}
```

#### Value Objects
Immutable objects defined by their attributes.

```typescript
// src/domain/value-objects/money.vo.ts
export class Money {
  private constructor(private readonly _amount: number) {
    if (!Number.isFinite(_amount)) {
      throw new Error('Money amount must be a finite number');
    }
  }

  static of(amount: number): Money {
    return new Money(Math.round(amount * 100) / 100); // 2 decimal places
  }

  static zero(): Money {
    return new Money(0);
  }

  get value(): number { return this._amount; }

  add(other: Money): Money {
    return new Money(this._amount + other._amount);
  }

  subtract(other: Money): Money {
    return new Money(this._amount - other._amount);
  }

  isLessThan(other: Money): boolean {
    return this._amount < other._amount;
  }

  isNegativeOrZero(): boolean {
    return this._amount <= 0;
  }

  equals(other: Money): boolean {
    return this._amount === other._amount;
  }
}
```

#### Repository Interfaces (Ports)
Abstractions for data access - NO implementation details.

```typescript
// src/domain/interfaces/wallet.repository.ts
export interface IWalletRepository {
  findByUserId(userId: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<void>;
  findByIdWithLock(walletId: string): Promise<Wallet | null>;
}

// src/domain/interfaces/transaction.repository.ts
export interface ITransactionRepository {
  save(transaction: Transaction): Promise<void>;
  findByUserId(userId: string, options?: PaginationOptions): Promise<Transaction[]>;
  findByIdempotencyKey(key: string): Promise<Transaction | null>;
}
```

#### Domain Events
Events that represent something important that happened.

```typescript
// src/domain/events/transaction-processed.event.ts
export class TransactionProcessedEvent {
  constructor(
    public readonly transactionId: string,
    public readonly walletId: string,
    public readonly userId: string,
    public readonly type: TransactionType,
    public readonly amount: Money,
    public readonly balanceAfter: Money,
    public readonly timestamp: Date,
  ) {}
}
```

#### Domain Services
Business logic that doesn't belong to a single entity.

```typescript
// src/domain/services/fraud-detection.service.ts
export class FraudDetectionService {
  constructor(
    private readonly config: FraudConfig,
  ) {}

  analyze(
    transaction: Transaction,
    recentTransactions: Transaction[],
  ): FraudAnalysisResult {
    const alerts: FraudAlert[] = [];

    // Check amount threshold
    if (transaction.amount.value > this.config.amountThreshold) {
      alerts.push(FraudAlert.highAmount(transaction));
    }

    // Check velocity
    const recentCount = recentTransactions.filter(t => 
      this.isWithinWindow(t.timestamp, this.config.velocityWindowMinutes)
    ).length;

    if (recentCount >= this.config.velocityMaxTransactions) {
      alerts.push(FraudAlert.velocityExceeded(transaction, recentCount));
    }

    return new FraudAnalysisResult(alerts);
  }
}
```

---

## Application Layer

### Purpose
Contains application-specific business rules. Orchestrates domain objects to perform use cases.

### Contents

#### Use Cases
Single-purpose classes that represent application operations.

```typescript
// src/application/use-cases/process-transaction.use-case.ts
export class ProcessTransactionUseCase {
  constructor(
    @Inject('IWalletRepository')
    private readonly walletRepository: IWalletRepository,
    @Inject('ITransactionRepository')
    private readonly transactionRepository: ITransactionRepository,
    private readonly fraudDetection: FraudDetectionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(input: ProcessTransactionInput): Promise<ProcessTransactionOutput> {
    // 1. Get or create wallet
    let wallet = await this.walletRepository.findByUserId(input.userId);
    if (!wallet) {
      wallet = Wallet.create(input.userId);
    }

    // 2. Process transaction (domain logic)
    const amount = Money.of(input.amount);
    const result = input.type === 'DEPOSIT'
      ? wallet.deposit(amount)
      : wallet.withdraw(amount);

    if (result.isFailure) {
      throw new ApplicationException(result.error);
    }

    const transaction = result.value;

    // 3. Fraud detection
    const recentTxs = await this.transactionRepository.findByUserId(
      input.userId,
      { limit: 20, since: minutesAgo(30) }
    );
    const fraudResult = this.fraudDetection.analyze(transaction, recentTxs);

    // 4. Persist
    await this.walletRepository.save(wallet);
    await this.transactionRepository.save(transaction);

    // 5. Emit events
    this.eventEmitter.emit('transaction.processed', new TransactionProcessedEvent(...));

    if (fraudResult.hasAlerts()) {
      this.eventEmitter.emit('fraud.detected', fraudResult.alerts);
    }

    // 6. Return output
    return {
      transactionId: transaction.id,
      type: transaction.type,
      amount: transaction.amount.value,
      balanceAfter: wallet.balance.value,
      timestamp: transaction.timestamp,
    };
  }
}
```

#### DTOs
Data transfer objects for use case input/output.

```typescript
// src/application/dtos/process-transaction.dto.ts
export class ProcessTransactionInput {
  transactionId: string;  // Idempotency key from client
  userId: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAW';
  timestamp: Date;
}

export class ProcessTransactionOutput {
  transactionId: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: number;
  balanceAfter: number;
  timestamp: Date;
}
```

---

## Infrastructure Layer

### Purpose
Contains implementations of interfaces defined in the domain layer.
Deals with external concerns: databases, external services, etc.

### Contents

#### Repository Implementations

```typescript
// src/infrastructure/repositories/prisma-wallet.repository.ts
@Injectable()
export class PrismaWalletRepository implements IWalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<Wallet | null> {
    const data = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    
    if (!data) return null;
    
    return Wallet.reconstitute(
      data.id,
      data.userId,
      Money.of(data.balance.toNumber()),
    );
  }

  async save(wallet: Wallet): Promise<void> {
    await this.prisma.wallet.upsert({
      where: { id: wallet.id },
      create: {
        id: wallet.id,
        userId: wallet.userId,
        balance: wallet.balance.value,
      },
      update: {
        balance: wallet.balance.value,
      },
    });
  }

  async findByIdWithLock(walletId: string): Promise<Wallet | null> {
    const [data] = await this.prisma.$queryRaw<WalletData[]>`
      SELECT * FROM wallets WHERE id = ${walletId} FOR UPDATE
    `;
    
    if (!data) return null;
    
    return Wallet.reconstitute(data.id, data.userId, Money.of(data.balance));
  }
}
```

#### Database Service

```typescript
// src/infrastructure/database/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async executeInTransaction<T>(
    fn: (prisma: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(fn);
  }
}
```

---

## Presentation Layer

### Purpose
Handles HTTP concerns. Transforms HTTP requests to use case inputs and use case outputs to HTTP responses.

### Contents

#### Controllers

```typescript
// src/presentation/controllers/transaction.controller.ts
@ApiTags('Transactions')
@Controller('api/v1/transactions')
export class TransactionController {
  constructor(
    private readonly processTransaction: ProcessTransactionUseCase,
    private readonly getHistory: GetTransactionHistoryUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Process a transaction (deposit or withdraw)' })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 422, description: 'Business rule violation' })
  async process(
    @Body() dto: CreateTransactionRequestDto,
  ): Promise<TransactionResponseDto> {
    const result = await this.processTransaction.execute({
      transactionId: dto.transaction_id,
      userId: dto.user_id,
      amount: dto.amount,
      type: dto.type.toUpperCase() as 'DEPOSIT' | 'WITHDRAW',
      timestamp: new Date(dto.timestamp),
    });

    return TransactionResponseDto.fromUseCaseOutput(result);
  }

  @Get()
  @ApiOperation({ summary: 'Get transaction history' })
  @ApiQuery({ name: 'user_id', required: true })
  async getTransactionHistory(
    @Query('user_id') userId: string,
  ): Promise<TransactionResponseDto[]> {
    const result = await this.getHistory.execute({ userId });
    return result.map(TransactionResponseDto.fromUseCaseOutput);
  }
}
```

#### Request/Response DTOs

```typescript
// src/presentation/dtos/transaction.dto.ts
export class CreateTransactionRequestDto {
  @ApiProperty({ example: 'uuid-v4' })
  @IsUUID()
  transaction_id: string;

  @ApiProperty({ example: 'uuid-v4' })
  @IsUUID()
  user_id: string;

  @ApiProperty({ example: 100.50 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: ['deposit', 'withdraw'] })
  @IsIn(['deposit', 'withdraw'])
  type: string;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  @IsISO8601()
  timestamp: string;
}

export class TransactionResponseDto {
  @ApiProperty()
  transaction_id: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  balance_after: number;

  @ApiProperty()
  timestamp: string;

  static fromUseCaseOutput(output: ProcessTransactionOutput): TransactionResponseDto {
    return {
      transaction_id: output.transactionId,
      type: output.type.toLowerCase(),
      amount: output.amount,
      balance_after: output.balanceAfter,
      timestamp: output.timestamp.toISOString(),
    };
  }
}
```

#### Exception Filter

```typescript
// src/presentation/filters/http-exception.filter.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.getErrorDetails(exception);

    this.logger.error(`${request.method} ${request.url} - ${status} - ${message}`);

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private getErrorDetails(exception: unknown) {
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        message: exception.message,
        error: exception.name,
      };
    }

    if (exception instanceof ApplicationException) {
      return {
        status: 422,
        message: exception.message,
        error: 'Unprocessable Entity',
      };
    }

    return {
      status: 500,
      message: 'Internal Server Error',
      error: 'Internal Server Error',
    };
  }
}
```

---

## Module Organization

```typescript
// src/domain/domain.module.ts
@Module({
  providers: [FraudDetectionService],
  exports: [FraudDetectionService],
})
export class DomainModule {}

// src/infrastructure/infrastructure.module.ts
@Module({
  providers: [
    PrismaService,
    { provide: 'IWalletRepository', useClass: PrismaWalletRepository },
    { provide: 'ITransactionRepository', useClass: PrismaTransactionRepository },
  ],
  exports: ['IWalletRepository', 'ITransactionRepository', PrismaService],
})
export class InfrastructureModule {}

// src/application/application.module.ts
@Module({
  imports: [DomainModule, InfrastructureModule],
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
@Module({
  imports: [ApplicationModule],
  controllers: [TransactionController, WalletController, FraudController],
})
export class PresentationModule {}
```
