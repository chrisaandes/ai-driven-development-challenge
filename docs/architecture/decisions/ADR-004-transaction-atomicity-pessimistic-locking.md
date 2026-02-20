# ADR-004: Transaction Atomicity with Pessimistic Locking

## Status
Accepted

## Date
2026-02-20

## Context

The Refacil Wallet microservice must process deposits and withdrawals atomically, ensuring that the wallet balance is never corrupted by concurrent requests. This is the most critical correctness requirement in the system: **the wallet balance must never go negative due to a race condition**.

### The Race Condition Problem (TOCTOU)

Consider two concurrent withdrawal requests for the same wallet:

```
Wallet balance: $100

Thread A (withdraw $80):              Thread B (withdraw $80):
-----------------------               -----------------------
1. Read balance: $100                 1. Read balance: $100
2. Check: $100 >= $80  (pass)         2. Check: $100 >= $80  (pass)
3. New balance: $100 - $80 = $20      3. New balance: $100 - $80 = $20
4. Write balance: $20                 4. Write balance: $20

Final balance: $20
Expected: -$60 (impossible) or $20 (only one withdrawal succeeds)
Actual: Both withdrawals succeed, $60 created from nothing.
```

This is a **Time of Check to Time of Use (TOCTOU)** vulnerability. The balance check (step 2) and the balance update (step 4) are separate operations, and another transaction can interleave between them. In a financial system, this is not merely a data integrity bug -- it is a direct monetary loss.

### Specific Constraints

1. **PostgreSQL 16** is the database (per `.claude/steering/tech.md`)
2. **Prisma 5.x** is the ORM (per ADR-002), which supports interactive transactions and raw SQL via `$queryRaw`
3. **1,000 TPS peak** is the performance target (per `.claude/steering/product.md`)
4. **Balance must NEVER go negative** due to concurrent operations
5. **Eventual consistency is NOT acceptable** for balance updates. The balance must reflect the true state after every committed transaction
6. **Single-wallet operations dominate**: The system does not support wallet-to-wallet transfers (out of scope). Contention is primarily per-wallet, not cross-wallet
7. **Read-heavy workload**: Balance queries and transaction history queries significantly outnumber mutations. The locking strategy should not impede read performance

### What "1,000 TPS" Really Means for Contention

The 1,000 TPS target is the total system throughput across all users. The actual contention per wallet is much lower:

- Assume 10,000 active wallets
- 1,000 TPS total / 10,000 wallets = 0.1 TPS per wallet on average
- Even for the most active wallet (assume 100x average), contention is ~10 TPS per wallet
- At 10 TPS per wallet with a lock hold time of 5-20ms, the probability of lock contention is low

This analysis is critical: it means we can use a locking strategy that trades throughput for simplicity, because the actual contention is well within what PostgreSQL row-level locks can handle.

## Decision

We use **pessimistic locking with `SELECT ... FOR UPDATE`** within Prisma interactive transactions to guarantee atomic balance updates.

### Implementation Pattern

Every financial operation that modifies a wallet balance follows this sequence:

```
1. BEGIN Prisma interactive transaction
2. SELECT wallet row FOR UPDATE (acquires exclusive row lock)
3. Validate balance in domain entity (Result pattern, per ADR-003)
4. Update wallet balance
5. Insert transaction record
6. COMMIT (releases lock)
```

### Code Implementation

#### Repository Layer: Acquiring the Lock

```typescript
// src/infrastructure/repositories/prisma-wallet.repository.ts
@Injectable()
export class PrismaWalletRepository implements IWalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a wallet by user ID with an exclusive row lock.
   * Must be called within a Prisma interactive transaction.
   * The lock is held until the transaction commits or rolls back.
   */
  async findByUserIdWithLock(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<Wallet | null> {
    const records = await tx.$queryRaw<WalletRecord[]>`
      SELECT id, user_id, balance, currency, version, created_at, updated_at
      FROM wallets
      WHERE user_id = ${userId}
      FOR UPDATE
    `;

    if (records.length === 0) return null;

    const record = records[0];
    return Wallet.reconstitute({
      id: record.id,
      userId: record.user_id,
      balance: record.balance,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  }
}
```

Key points:
- The `FOR UPDATE` clause acquires an exclusive lock on the wallet row
- The `tx` parameter ensures this runs within an interactive transaction
- Tagged template literal (`$queryRaw\`...\``) ensures parameterized execution (SQL-injection-safe per `docs/research/02-security-practices.md`, Section 2)
- The lock is automatically released when the enclosing transaction commits or rolls back

#### Repository Layer: Atomic Save

```typescript
// src/infrastructure/repositories/prisma-transaction.repository.ts
@Injectable()
export class PrismaTransactionRepository implements ITransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically save a transaction and update the wallet balance.
   * Both operations succeed or both fail.
   * The wallet row MUST be locked (via findByUserIdWithLock) before calling this.
   */
  async saveWithWalletUpdate(
    transaction: Transaction,
    wallet: Wallet,
  ): Promise<Transaction> {
    return this.prisma.$transaction(async (tx) => {
      // Step 1: Lock the wallet row
      const lockedWallet = await tx.$queryRaw<WalletRecord[]>`
        SELECT id, user_id, balance, version
        FROM wallets
        WHERE id = ${wallet.id}
        FOR UPDATE
      `;

      if (lockedWallet.length === 0) {
        throw new Error(`Wallet ${wallet.id} not found during lock acquisition`);
      }

      // Step 2: Update wallet balance (within the lock)
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance.value,
          updatedAt: new Date(),
          version: { increment: 1 },
        },
      });

      // Step 3: Create transaction record
      const record = await tx.transaction.create({
        data: {
          id: transaction.id,
          walletId: transaction.walletId,
          userId: transaction.userId,
          type: transaction.type,
          amount: transaction.amount.value,
          currency: transaction.amount.currency ?? 'COP',
          balanceAfter: wallet.balance.value,
          description: transaction.description,
          status: transaction.status,
          idempotencyKey: transaction.idempotencyKey,
        },
      });

      return this.toDomain(record);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10_000, // 10-second timeout to prevent indefinite lock hold
    });
  }
}
```

#### Use Case Layer: Orchestration

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
    // 1. Idempotency check (outside the lock -- fast path for duplicates)
    const existing = await this.transactionRepository.findByIdempotencyKey(
      input.transactionId,
    );
    if (existing) {
      return TransactionMapper.toOutput(existing);
    }

    // 2. Atomic transaction processing with pessimistic locking
    //    The repository handles: lock -> validate -> update -> commit
    const savedTransaction = await this.transactionRepository.saveWithWalletUpdate(
      /* transaction entity built from domain logic */,
      /* wallet entity with updated balance */,
    );

    // 3. Publish events AFTER successful commit
    //    At this point, the lock has been released and the data is persisted
    this.eventEmitter.emit('transaction.completed', /* event */);

    return TransactionMapper.toOutput(savedTransaction);
  }
}
```

### How Pessimistic Locking Prevents the Race Condition

```
Thread A (withdraw $80):                    Thread B (withdraw $80):
-----------------------                     -----------------------
1. BEGIN TRANSACTION
2. SELECT * FROM wallets
   WHERE user_id = 'abc'
   FOR UPDATE
   -> Acquires row lock
   -> Reads balance: $100
                                            1. BEGIN TRANSACTION
                                            2. SELECT * FROM wallets
                                               WHERE user_id = 'abc'
                                               FOR UPDATE
                                               -> BLOCKED! Row is locked by Thread A
3. Domain: wallet.withdraw($80)
   -> Check: $100 >= $80  (pass)
   -> New balance: $20
4. UPDATE wallets SET balance = 20
   WHERE id = 'wallet-1'
5. INSERT INTO transactions ...
6. COMMIT
   -> Lock released
                                               -> Lock acquired!
                                               -> Reads balance: $20 (updated by A)
                                            3. Domain: wallet.withdraw($80)
                                               -> Check: $20 >= $80  (FAIL)
                                               -> Result.fail(InsufficientFundsError)
                                            4. ROLLBACK
                                            -> Returns 422 Insufficient Funds

Final balance: $20 (correct)
```

Thread B reads the wallet balance **after** Thread A has committed, so it sees the updated balance of $20, not the stale $100. The domain entity's `withdraw()` method (per ADR-003) returns `Result.fail(InsufficientFundsError)`, which the application layer translates to a 422 HTTP response.

### Transaction Timeout Configuration

```typescript
// Prisma interactive transaction with explicit timeout
await this.prisma.$transaction(
  async (tx) => {
    // ... lock, validate, update ...
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: 10_000,    // Maximum 10 seconds for the entire transaction
    maxWait: 5_000,     // Maximum 5 seconds waiting for a connection from the pool
  },
);
```

- `timeout: 10_000` -- If the transaction takes longer than 10 seconds (including lock wait time), Prisma automatically rolls it back. This prevents indefinite lock holds due to slow queries or application bugs.
- `maxWait: 5_000` -- If no database connection is available from the pool within 5 seconds, the transaction fails immediately.
- `ReadCommitted` isolation level is sufficient because `FOR UPDATE` provides the necessary serialization for the locked row.

### Deadlock Prevention

The current scope (single-wallet operations only) has minimal deadlock risk because each transaction locks at most one wallet row. However, for future wallet-to-wallet transfers, deadlocks must be prevented through consistent lock ordering:

```typescript
// Future: Wallet-to-wallet transfer with consistent lock ordering
async processTransfer(fromUserId: string, toUserId: string, amount: number) {
  return this.prisma.$transaction(async (tx) => {
    // Always lock in alphabetical order by user ID to prevent deadlocks
    const [firstId, secondId] = [fromUserId, toUserId].sort();

    const wallet1 = await tx.$queryRaw<WalletRecord[]>`
      SELECT * FROM wallets WHERE user_id = ${firstId} FOR UPDATE
    `;
    const wallet2 = await tx.$queryRaw<WalletRecord[]>`
      SELECT * FROM wallets WHERE user_id = ${secondId} FOR UPDATE
    `;

    // Process transfer with both wallets locked
  });
}
```

The rule is simple: **always acquire locks in deterministic order** (alphabetical by ID, numerical by ID, or any consistent ordering). This eliminates the circular wait condition that causes deadlocks.

### Idempotency Key and Locking Interaction

The idempotency check happens **before** acquiring the lock:

```typescript
// Fast path: check idempotency key without locking
const existing = await this.transactionRepository.findByIdempotencyKey(key);
if (existing) return existing;  // No lock needed for duplicate requests

// Slow path: acquire lock and process
await this.prisma.$transaction(async (tx) => {
  // Re-check idempotency inside the transaction (double-check pattern)
  const existingInTx = await tx.transaction.findUnique({
    where: { idempotencyKey: key },
  });
  if (existingInTx) return existingInTx;

  // ... lock wallet, validate, update ...
});
```

The double-check pattern ensures that:
1. Most duplicate requests are handled without acquiring a lock (fast path)
2. Two concurrent requests with the same idempotency key are handled correctly by the unique constraint on `idempotency_key` in the database

### Performance Characteristics

| Metric | Expected Value | Notes |
|--------|---------------|-------|
| Lock acquisition time | < 1ms | PostgreSQL row lock is acquired during the SELECT query |
| Lock hold duration | 5-20ms | Time from SELECT FOR UPDATE to COMMIT |
| Lock wait time (contention) | 0-50ms | Only when two requests target the same wallet simultaneously |
| Transaction latency (no contention) | 10-30ms | Database round-trips: SELECT + UPDATE + INSERT |
| Transaction latency (with contention) | 20-80ms | Includes lock wait time |
| Maximum per-wallet throughput | ~50-200 TPS | Limited by lock hold duration (5-20ms per transaction) |

At the system level, 1,000 TPS distributed across thousands of wallets means average per-wallet contention is near zero. The pessimistic locking overhead is negligible at this scale.

## Alternatives Considered

### Alternative 1: Optimistic Locking (Version Column)

Add a `version` column to the wallet table. On update, include `WHERE version = currentVersion` in the update condition. If the row was modified by another transaction, the update affects zero rows, and the application retries.

```typescript
// Optimistic locking approach
const wallet = await prisma.wallet.findUnique({ where: { userId } });

const result = await prisma.wallet.updateMany({
  where: {
    id: wallet.id,
    version: wallet.version,  // Only update if version matches
  },
  data: {
    balance: newBalance,
    version: { increment: 1 },
  },
});

if (result.count === 0) {
  // Version mismatch -- another transaction modified the wallet
  throw new OptimisticLockException('Wallet', wallet.id);
}
```

**Pros**:
- No database-level locks held during the transaction, meaning higher theoretical throughput
- No deadlock risk (no locks to create circular waits)
- Better performance under very low contention (no lock acquisition overhead)
- Standard pattern in distributed systems where pessimistic locking is unavailable
- The version column is already in our Prisma schema as a fallback mechanism

**Cons**:
- **Retry storms under high contention**: If multiple requests target the same wallet simultaneously, all but one fail and must retry. Under sustained load, retries compound: N requests generate N*(N-1)/2 retry attempts, creating exponential load amplification
- **Wasted work**: Each failed attempt has already performed a database read, domain validation, and attempted write -- all discarded on retry
- **Correctness depends on retry logic**: If the retry limit is exhausted or the backoff is miscalibrated, legitimate transactions are rejected even though the wallet has sufficient balance. This is a business-level failure caused by infrastructure, not domain rules
- **More complex implementation**: Retry loop with exponential backoff and jitter, maximum retry count, retry-specific error handling, and monitoring for retry rate
- **Non-deterministic latency**: Under contention, a transaction might take 1 attempt (10ms) or 3 attempts (200ms+). The p99 latency variance is much higher than with pessimistic locking

**Why rejected**: For a financial system, the predictability of pessimistic locking is more valuable than the theoretical throughput advantage of optimistic locking. A wallet withdrawal should either succeed or fail with a clear business reason (insufficient balance), never fail because "another transaction was faster." The retry storm risk under load is particularly dangerous because it creates positive feedback loops: more retries increase load, which causes more retries.

However, we keep the `version` column in the schema as a safety net. It can be used for:
- Detection of concurrent modifications in non-critical paths (balance queries)
- A fallback mechanism if pessimistic locking proves insufficient at scale
- Audit trail (incrementing version number tracks how many times a wallet was modified)

### Alternative 2: Serializable Isolation Level

Set the PostgreSQL transaction isolation level to `SERIALIZABLE`, which causes the database to automatically detect and abort conflicting transactions.

```typescript
await this.prisma.$transaction(
  async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    // No explicit FOR UPDATE needed -- Serializable isolation handles it
    wallet.balance -= amount;
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: wallet.balance } });
  },
  { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
);
```

**Pros**:
- Strongest possible consistency guarantee
- No application-level locking code needed
- PostgreSQL handles all conflict detection and resolution automatically
- Works for any query pattern, not just single-row operations
- No deadlock risk (PostgreSQL uses predicate locks, not row locks, for Serializable)

**Cons**:
- **Very high overhead**: PostgreSQL maintains predicate locks for every read operation, not just writes. For a high-throughput financial service, this significantly increases memory and CPU usage
- **Frequent serialization failures**: Under any concurrent access, PostgreSQL aborts transactions that it detects might violate serializability. The application must handle `40001 serialization_failure` errors and retry. At 1,000 TPS, the abort rate can be significant
- **Unpredictable retry behavior**: Unlike optimistic locking where retries are application-controlled, Serializable retries are triggered by the database. The application has less control over backoff and retry limits
- **Full table predicate locks for range scans**: If the fraud detection service reads recent transactions (a range query), Serializable isolation acquires predicate locks on the range, potentially conflicting with unrelated transactions
- **Not composable with FOR UPDATE**: Using `FOR UPDATE` within a Serializable transaction is redundant and can cause confusing error behavior

**Why rejected**: The performance overhead of Serializable isolation is disproportionate for our use case. We need strong consistency for a single row (the wallet), not for the entire transaction's read set. `SELECT ... FOR UPDATE` on the wallet row provides the exact consistency guarantee we need with minimal overhead. Serializable isolation would impose that overhead on every query in every transaction.

### Alternative 3: PostgreSQL Advisory Locks

Use PostgreSQL's advisory locking functions (`pg_advisory_xact_lock(bigint)`) to acquire a named lock scoped to the wallet, without locking the actual row.

```typescript
await this.prisma.$transaction(async (tx) => {
  // Acquire advisory lock using wallet ID hash
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

  // Now safe to read and modify the wallet
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  // ... validate and update ...
});
// Advisory lock automatically released when transaction commits
```

**Pros**:
- Lightweight: advisory locks have minimal overhead compared to row locks
- Can lock on any key (not tied to existing rows), useful for wallet creation
- Lock is automatically released on transaction commit/rollback
- No impact on other queries that do not acquire the advisory lock (reads are not blocked)
- Higher throughput than row locks under extreme contention

**Cons**:
- **Application must enforce lock discipline**: Every code path that modifies a wallet must acquire the advisory lock. If any code path forgets, the race condition is silently reintroduced. Row-level locks (`FOR UPDATE`) are enforced by the database regardless of application code
- **Hash collision risk**: `hashtext()` produces a 32-bit hash. With thousands of wallets, hash collisions are possible, causing unrelated wallets to contend for the same lock
- **Non-standard pattern**: Advisory locks are PostgreSQL-specific and not widely used in NestJS/Prisma applications. Debugging, monitoring, and understanding the locking behavior requires PostgreSQL expertise
- **Deadlock risk if multiple locks are acquired**: If a transaction acquires advisory locks for two wallets in inconsistent order, deadlocks can occur. The same mitigation (consistent ordering) applies, but it is harder to enforce because advisory locks are not tied to specific rows
- **Invisible to standard monitoring tools**: PostgreSQL's `pg_locks` view shows advisory locks, but standard application monitoring tools may not surface them

**Why rejected**: Advisory locks solve a scaling problem we do not have. At 1,000 TPS distributed across thousands of wallets, PostgreSQL row locks are efficient and sufficient. Advisory locks add complexity (hash collisions, manual discipline, non-standard monitoring) without providing a benefit at our scale. If we later need to scale to 10,000+ TPS per wallet, advisory locks become relevant and can be adopted as a targeted optimization.

### Alternative 4: Database CHECK Constraint (balance >= 0)

Add a `CHECK (balance >= 0)` constraint to the wallets table, relying on the database to prevent negative balances regardless of application logic.

```sql
ALTER TABLE wallets ADD CONSTRAINT positive_balance CHECK (balance >= 0);
```

```typescript
// Application optimistically updates the balance
await prisma.wallet.update({
  where: { id: wallet.id },
  data: { balance: { decrement: amount } },
});
// If balance would go negative, PostgreSQL throws a CHECK violation error
```

**Pros**:
- Ultimate safety net: impossible to have negative balance regardless of application bugs
- Zero application-level locking code needed
- Works correctly under any concurrency scenario
- Extremely simple implementation
- Can be combined with other strategies as defense-in-depth

**Cons**:
- **Loses domain control**: The balance validation moves from the domain entity (`Wallet.withdraw()`) to the database. The domain no longer enforces its own invariants -- it delegates to infrastructure
- **Poor error messages**: PostgreSQL CHECK constraint violations produce database-level error messages (`ERROR: new row for relation "wallets" violates check constraint "positive_balance"`) that are not user-friendly. Translating these to meaningful business errors ("Insufficient balance: you have $20 but tried to withdraw $80") requires parsing PostgreSQL error strings
- **Race condition still exists logically**: Two concurrent withdrawals might both attempt `decrement: 80`. The first succeeds (100 - 80 = 20), the second fails with a CHECK violation (20 - 80 = -60). But the error is a database exception, not a domain Result. The flow is correct but the error handling is messy
- **Cannot enforce business rules beyond zero**: What if the business later requires a minimum balance of $10? Or a maximum withdrawal limit? Database constraints are limited to simple expressions
- **Violates Clean Architecture**: Business rules (balance >= 0) are embedded in the database schema rather than the domain entity. Per ADR-001, the domain layer should own all business rules

**Why rejected**: The CHECK constraint is a valuable **defense-in-depth** measure and should be added to the schema. However, it cannot be the **primary** mechanism for concurrency control because it moves domain logic into the database and produces poor error messages. We add `CHECK (balance >= 0)` as a safety net that should never be triggered in normal operation -- all balance validation happens in the domain entity with proper error messages. If the CHECK constraint ever fires, it indicates a bug in the application code.

## Consequences

### Positive

- **Strong consistency guaranteed**: It is mathematically impossible for two concurrent transactions to overdraw a wallet. The `FOR UPDATE` lock serializes all modifications to a single wallet row. Combined with the domain entity's `withdraw()` method (which returns `Result.fail(InsufficientFundsError)` when balance is insufficient), the system has two layers of protection.

- **Simple mental model**: "Lock the wallet, do your work, commit." Developers do not need to reason about retries, version conflicts, or transaction ordering. The database handles serialization transparently.

- **Predictable latency**: Under typical load (0.1 TPS per wallet average), there is almost no lock contention. The latency is simply the database round-trip time (10-30ms). Under contention, the waiting thread blocks for 5-20ms until the lock is released. There are no retry loops, no exponential backoff, no wasted work.

- **PostgreSQL handles it efficiently**: PostgreSQL's MVCC implementation and row-level locking are highly optimized. At 1,000 TPS total with thousands of wallets, the lock contention is minimal. The `pg_stat_activity` view and `pg_locks` view provide direct visibility into lock wait times for monitoring.

- **Compatible with idempotency**: The double-check idempotency pattern (check before lock, re-check inside lock) means duplicate requests are handled correctly without additional complexity.

### Negative

- **Row is locked during transaction**: While a transaction is being processed, the wallet row is exclusively locked. Other transactions targeting the same wallet must wait. For a wallet with 10 TPS, this means up to 10 * 20ms = 200ms of cumulative lock time per second, which is acceptable. For a wallet with 100+ TPS (unlikely), this could become a bottleneck.

- **Slightly more complex repository implementation**: The `findByUserIdWithLock()` method requires `$queryRaw` because Prisma's typed API does not support `FOR UPDATE`. This raw SQL query must be carefully parameterized (tagged template literals only) and tested separately.

- **Database dependency for correctness**: The correctness of the concurrency control depends on PostgreSQL's `FOR UPDATE` behavior. If the application were migrated to a database that does not support row-level exclusive locks (e.g., some NoSQL databases), the concurrency strategy would need to be redesigned entirely.

- **Lock timeout tuning**: The 10-second transaction timeout is a balance between allowing legitimate slow transactions and preventing indefinite lock holds. If a transaction is slow due to a downstream dependency (e.g., fraud detection taking too long), it may be aborted by the timeout. The fraud detection is mitigated by running it asynchronously after the transaction commits (event-driven, per the executive summary).

### Risks

- **Deadlock if locking order is inconsistent**: If a future feature acquires locks on multiple wallet rows in different orders across different code paths, PostgreSQL will detect a deadlock and abort one transaction. **Mitigation**: Document and enforce the rule "always lock wallets in ascending ID order." For the current scope (single-wallet operations), this risk does not exist.

- **Connection pool exhaustion under sustained lock contention**: If many transactions target the same wallet and each holds a lock for 20ms, waiting transactions hold database connections while waiting. With a pool of 5 connections per pod and a lock wait queue of 50 requests, the pool may be exhausted. **Mitigation**: The Prisma `maxWait: 5000` setting causes waiting transactions to fail fast rather than blocking indefinitely. Monitor the `prisma_pool_wait_duration` metric and the `pg_stat_activity` view for lock waits exceeding 100ms.

- **Long-running transactions blocking other operations**: A bug that causes a transaction to hang (e.g., an infinite loop, an unresolved Promise) would hold the lock indefinitely. **Mitigation**: The `timeout: 10_000` setting on the Prisma interactive transaction ensures automatic rollback after 10 seconds. PostgreSQL's `statement_timeout` can be set as a database-level safety net.

- **Monitoring blind spots**: Lock contention is only visible through PostgreSQL's `pg_locks` and `pg_stat_activity` views. Application-level metrics may not capture lock wait times. **Mitigation**: Add Prisma query event logging (slow query detection) and periodically query `pg_stat_activity` for blocked queries in the health check or monitoring pipeline.

## References

- PostgreSQL 16 Documentation: Explicit Locking. https://www.postgresql.org/docs/16/explicit-locking.html
- PostgreSQL 16 Documentation: SELECT FOR UPDATE. https://www.postgresql.org/docs/16/sql-select.html#SQL-FOR-UPDATE-SHARE
- PostgreSQL 16 Documentation: Transaction Isolation. https://www.postgresql.org/docs/16/transaction-iso.html
- Prisma Documentation: Interactive Transactions. https://www.prisma.io/docs/concepts/components/prisma-client/transactions#interactive-transactions
- Research document: `docs/research/02-security-practices.md` -- Race condition handling (Section 3)
- Research document: `docs/research/00-executive-summary.md` -- Concurrency control decision
- Architecture guidelines: `.claude/steering/architecture.md` -- Repository implementation with locking
- Product requirements: `.claude/steering/product.md` -- Performance targets (1,000 TPS, < 200ms p99)
- Requirements specification: `.claude/specs/01-core-transactions/requirements.md` -- Atomicity requirements
