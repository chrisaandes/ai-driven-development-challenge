# ADR-002: Prisma ORM Selection

## Status
Accepted

## Date
2026-02-20

## Context

The Refacil Wallet microservice requires a data access layer to interact with PostgreSQL 16 for persisting wallets, transactions, and fraud alerts. The choice of ORM or query builder has far-reaching consequences for type safety, developer productivity, migration management, and the ability to implement financial-grade features like pessimistic locking and atomic transactions.

Several specific requirements drive this decision:

1. **Type safety is critical for financial data**: An amount stored as `Decimal(15,2)` in PostgreSQL must be correctly typed in TypeScript. A type mismatch that silently converts `100.50` to `100` or `"100.50"` (string) could cause monetary loss. The ORM must generate accurate TypeScript types from the database schema.

2. **Transaction support with raw SQL escape hatch**: The core transaction processing flow requires Prisma interactive transactions (`$transaction(async (tx) => { ... })`) for atomicity. Additionally, pessimistic locking via `SELECT ... FOR UPDATE` requires raw SQL execution within that same transaction context. The ORM must support both typed queries and parameterized raw SQL within a single transaction.

3. **Migration management**: The project needs a reliable, version-controlled migration system that can be run as a pre-deploy step in Kubernetes (see `docs/research/04-infrastructure.md`). Migrations must be deterministic, replayable, and reviewable in pull requests.

4. **Connection pooling**: At 1,000 TPS with 7-15 Kubernetes pods, each pod needs efficient connection management. The ORM should provide built-in connection pooling or integrate cleanly with PgBouncer / RDS Proxy.

5. **Clean Architecture compatibility**: Per ADR-001, the domain layer must have zero framework dependencies. The ORM must work as an infrastructure-layer adapter that implements domain repository interfaces. Domain entities must not contain ORM decorators or extend ORM base classes.

6. **Developer experience for parallel agent development**: Multiple AI agents implement different layers simultaneously. A schema-first approach (define schema, generate types, code against types) provides a shared contract that agents can develop against in parallel.

## Decision

We select **Prisma 5.x** as the ORM for the Refacil Wallet microservice.

### Schema Definition

The Prisma schema serves as the single source of truth for the database structure:

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
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @unique @map("user_id") @db.Uuid
  balance   Int      @default(0)    // Integer cents to avoid floating-point issues
  currency  String   @default("COP")
  version   Int      @default(1)    // For optimistic locking fallback
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  transactions Transaction[]

  @@map("wallets")
}

model Transaction {
  id             String   @id @default(uuid()) @db.Uuid
  walletId       String   @map("wallet_id") @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  type           String   // DEPOSIT, WITHDRAW
  amount         Int      // Integer cents
  currency       String   @default("COP")
  balanceAfter   Int      @map("balance_after") // Snapshot of balance after this transaction
  description    String?
  status         String   @default("COMPLETED")
  idempotencyKey String   @unique @map("idempotency_key")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  wallet Wallet @relation(fields: [walletId], references: [id])

  @@index([userId, createdAt])
  @@index([walletId])
  @@map("transactions")
}

model FraudAlert {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  alertType   String    @map("alert_type")  // VELOCITY, AMOUNT, PATTERN
  severity    String    // LOW, MEDIUM, HIGH, CRITICAL
  description String
  metadata    Json?     @default("{}")
  resolved    Boolean   @default(false)
  resolvedAt  DateTime? @map("resolved_at")
  resolvedBy  String?   @map("resolved_by")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@index([userId])
  @@index([resolved, createdAt])
  @@map("fraud_alerts")
}
```

### Integration with Clean Architecture

Prisma is confined entirely to the infrastructure layer. Domain entities never reference Prisma types:

```
Domain Layer                          Infrastructure Layer
────────────                          ────────────────────
Wallet entity (plain TS class)   <──  PrismaWalletRepository
  - Money value object                  - toDomain(): Prisma record -> Wallet.reconstitute()
  - Result<T, E> returns                - toPersistence(): Wallet -> Prisma create/update input
                                        - Uses PrismaService for queries

IWalletRepository (interface)    <──  PrismaWalletRepository implements IWalletRepository
ITransactionRepository           <──  PrismaTransactionRepository implements ITransactionRepository
```

### Reconstitute Pattern for Entity-ORM Mapping

Each repository contains private mapping methods that translate between Prisma records and domain entities:

```typescript
// src/infrastructure/repositories/prisma-wallet.repository.ts
@Injectable()
export class PrismaWalletRepository implements IWalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<Wallet | null> {
    const record = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async save(wallet: Wallet): Promise<void> {
    await this.prisma.wallet.upsert({
      where: { id: wallet.id },
      create: {
        id: wallet.id,
        userId: wallet.userId,
        balance: wallet.balance.value,  // Money -> integer cents
        currency: 'COP',
        version: 1,
      },
      update: {
        balance: wallet.balance.value,
        version: { increment: 1 },
      },
    });
  }

  private toDomain(record: PrismaWalletRecord): Wallet {
    return Wallet.reconstitute({
      id: record.id,
      userId: record.userId,
      balance: record.balance,          // integer cents -> Money.of()
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
```

### Raw SQL for Pessimistic Locking

Prisma's typed query API does not support `SELECT ... FOR UPDATE`. We use `$queryRaw` with tagged template literals (parameterized, SQL-injection-safe) within interactive transactions:

```typescript
async findByIdWithLock(walletId: string): Promise<Wallet | null> {
  // Tagged template literal -- Prisma parameterizes ${walletId} automatically
  const [data] = await this.prisma.$queryRaw<WalletRecord[]>`
    SELECT id, user_id, balance, currency, version, created_at, updated_at
    FROM wallets
    WHERE id = ${walletId}
    FOR UPDATE
  `;
  if (!data) return null;
  return this.toDomain(data);
}
```

This is the one place where we bypass Prisma's typed API. The trade-off is acceptable because:
- The query is simple, stable, and well-tested
- Tagged template literals prevent SQL injection (Prisma parameterizes automatically)
- It is isolated to a single repository method, not scattered across the codebase

### PrismaService with Lifecycle Management

```typescript
// src/infrastructure/database/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

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

### Migration Workflow

```bash
# During development: create and apply migrations
npx prisma migrate dev --name add_fraud_alerts_table

# In CI/CD: apply pending migrations (no interactive prompts)
npx prisma migrate deploy

# In Kubernetes: run as a pre-deploy Job
# (see docs/research/04-infrastructure.md for K8s Job configuration)
```

Migrations are stored in `prisma/migrations/` and committed to version control. Each migration is a timestamped SQL file that can be reviewed in pull requests.

### Money Storage Strategy

Financial amounts are stored as **integer cents** (e.g., `$100.50` is stored as `10050`). This decision eliminates floating-point precision errors that are inherent in IEEE 754 floating-point representation:

```
// DANGEROUS: floating-point arithmetic
0.1 + 0.2 = 0.30000000000000004

// SAFE: integer arithmetic
10 + 20 = 30  (cents)
```

The `Money` value object in the domain layer handles the conversion:
- `Money.of(10050)` -- construct from integer cents (database/internal)
- `Money.fromDecimal(100.50)` -- construct from decimal (API input)
- `money.toDecimal()` -- convert to decimal (API output)
- `money.value` -- raw integer cents (for persistence)

The Prisma schema uses `Int` type for balance and amount fields, matching the integer cents representation.

## Alternatives Considered

### Alternative 1: TypeORM

TypeORM is the most popular ORM in the NestJS ecosystem, with first-class NestJS integration via `@nestjs/typeorm`. It uses a decorator-based approach where entities are annotated with `@Entity()`, `@Column()`, etc.

**Pros**:
- Deep NestJS integration with dedicated module (`TypeOrmModule.forFeature()`)
- Active Record and Data Mapper patterns both supported
- Mature migration system
- Large community and extensive documentation
- QueryBuilder API for complex queries
- Supports `SELECT ... FOR UPDATE` natively via QueryBuilder

**Cons**:
- TypeScript type safety is weaker than Prisma. TypeORM's return types are often `any` or loosely typed, requiring manual type assertions. Relations can return `undefined` at runtime even when typed as required.
- Entity decorators (`@Entity()`, `@Column()`) would need to be placed on domain entities, violating Clean Architecture's rule that the domain has zero framework dependencies. Alternatively, separate TypeORM entity classes require a second mapping layer on top of the reconstitute pattern.
- Performance issues with eager loading and the "N+1 query" problem are well-documented. Prisma's explicit include/select model avoids this.
- Migration generation from entity changes can produce incorrect migrations when schema differences are ambiguous. Manual review is always required.
- The project has had periods of reduced maintenance activity, though it remains actively used.

**Why rejected**: TypeORM's decorator-based entity model is fundamentally incompatible with Clean Architecture without doubling the entity mapping effort. Prisma's schema-first approach keeps the schema definition external to the domain code, which aligns naturally with ports and adapters. The type safety gap is significant for financial data where a mistyped column can cause monetary errors.

### Alternative 2: MikroORM

MikroORM is a TypeScript ORM inspired by Hibernate/Doctrine that implements the Unit of Work and Identity Map patterns. It has strong DDD (Domain-Driven Design) support.

**Pros**:
- Native Unit of Work pattern -- tracks entity changes and flushes them atomically
- Identity Map prevents multiple instances of the same entity in memory
- Better DDD alignment than Prisma: entities can use private constructors, custom types
- Supports `SELECT ... FOR UPDATE` via QueryBuilder
- Strong TypeScript types with strict mode
- Active maintenance and growing community

**Cons**:
- Smaller ecosystem than Prisma or TypeORM. Fewer tutorials, Stack Overflow answers, and community plugins.
- Steeper learning curve, especially for the Unit of Work lifecycle (managed vs. detached entities, flush timing)
- NestJS integration exists but is less mature than TypeORM's
- Still requires decorators on entity classes (`@Entity()`, `@Property()`) for the metadata reflection system, which violates the domain layer's zero-dependency constraint unless separate mapped entities are used
- The Identity Map, while powerful, can cause subtle bugs if not properly understood (stale data, memory leaks in long-running transactions)

**Why rejected**: MikroORM's DDD features (Unit of Work, Identity Map) are appealing but come with complexity that does not justify itself for this project's scope. The learning curve is steep for the AI agents that will implement the infrastructure layer. Prisma's simplicity and type-generation approach are a better fit for the parallel agent development model.

### Alternative 3: Knex.js (Query Builder Only)

Knex.js is a SQL query builder (not a full ORM) that provides a fluent API for building SQL queries. It handles migrations and connection pooling but does not generate types or manage entity mapping.

**Pros**:
- Maximum control over generated SQL
- No abstraction overhead -- queries map directly to SQL
- Excellent migration system
- Lightweight, no entity mapping magic
- Full support for `SELECT ... FOR UPDATE` and any PostgreSQL-specific feature
- No interference with domain entity design

**Cons**:
- No automatic TypeScript type generation. Every query result must be manually typed, and types can drift from the actual schema without automated checking.
- No relation management -- joins, eager loading, and nested queries are all manual
- Significantly more code for basic CRUD operations
- No compile-time validation that query field names match actual column names
- Migration-only overlap with Prisma's migration system -- Knex migrations are JavaScript files, not SQL

**Why rejected**: For a project with multiple AI agents developing in parallel, the lack of generated types is a critical productivity loss. An agent implementing a repository method would need to manually define return types for every query, with no compiler assistance to catch mismatches. Prisma's generated client eliminates this entire class of bugs.

### Alternative 4: Raw SQL with pg Driver

Direct use of the `pg` (node-postgres) driver with handwritten SQL queries and a manual connection pool.

**Pros**:
- Zero abstraction overhead
- Complete control over every SQL statement
- No ORM-specific bugs or quirks
- Can use every PostgreSQL 16 feature without workarounds
- Smallest possible dependency footprint

**Cons**:
- No type safety at all. Query results are `any` unless manually typed with runtime validation.
- No migration system -- must use a separate tool (dbmate, migrate, or custom scripts)
- No connection pool management out of the box (must configure pg Pool manually)
- Every repository method requires writing raw SQL, including basic CRUD
- No protection against SQL injection unless the developer consistently uses parameterized queries
- Extremely high maintenance burden for even moderate schema complexity
- No compile-time validation of any kind

**Why rejected**: The maintenance cost is too high for a project that needs to move quickly with parallel agents. The risk of SQL injection bugs or type mismatches in financial queries is unacceptable when a safer alternative exists. Raw SQL is appropriate for isolated hot-path queries (which we use via Prisma's `$queryRaw`), but not as the primary data access strategy.

## Consequences

### Positive

- **Generated TypeScript client with exact types**: After running `npx prisma generate`, every table, column, relation, and enum is available as a TypeScript type. The compiler catches field name typos, type mismatches, and missing required fields at build time rather than runtime. For financial data, this means an amount field typed as `Int` in the schema will be typed as `number` in TypeScript -- no accidental string-to-number conversions.

- **Schema-first development enables parallelism**: The Prisma schema can be designed and committed first (by the infrastructure-dev agent). Other agents then run `npx prisma generate` to get the types they need for their layer. The domain-dev agent uses the schema as a reference for entity design. The api-dev agent uses it to understand the data model for request/response DTOs.

- **Reliable migration system**: `prisma migrate dev` generates timestamped SQL migration files that are deterministic, human-readable, and version-controlled. The Kubernetes pre-deploy Job runs `prisma migrate deploy` to apply pending migrations exactly once, avoiding the N-pod concurrent migration problem.

- **Built-in connection pooling**: Prisma Client manages a connection pool internally, with configurable pool size via the `connection_limit` URL parameter. At 5 connections per pod with 15 pods, this stays within PostgreSQL's default `max_connections = 100` (with room for admin connections and RDS Proxy overhead).

- **Clean separation from domain**: The Prisma schema file (`prisma/schema.prisma`) and generated client (`@prisma/client`) are entirely contained within the infrastructure layer. Domain entities are plain TypeScript classes with no Prisma decorators or imports.

### Negative

- **Cannot map directly to domain entities**: Prisma generates its own model types (e.g., `Prisma.Wallet`) that do not match domain entities. Every repository must implement `toDomain()` and `toPersistence()` mapping methods. This is repetitive boilerplate, especially for entities with many fields.

- **Raw SQL needed for pessimistic locking**: Prisma's typed query API does not support `SELECT ... FOR UPDATE`. The `findByIdWithLock()` method must use `$queryRaw`, losing Prisma's type safety for that specific query. The return type is `unknown[]` by default and must be manually typed.

- **Schema-first, not domain-first**: In pure DDD, the domain model drives the database schema. With Prisma, the schema file drives the generated types, which influences how repositories are written. This is a philosophical tension: the schema should ideally be derived from domain entities, not the other way around. In practice, this tension is manageable because the domain-dev agent designs entities first, then the infrastructure-dev agent translates that design into the Prisma schema.

- **Decimal handling requires care**: Prisma maps PostgreSQL `Decimal` to a `Prisma.Decimal` type (backed by `decimal.js`), which does not interoperate cleanly with JavaScript `number`. Our solution (storing as integer cents using `Int`) avoids this issue but requires discipline: every API input must be converted from decimal to cents at the boundary, and every output must be converted back.

- **Limited support for PostgreSQL-specific features**: Advanced PostgreSQL features like partial indexes, generated columns, row-level security, and advisory locks require raw SQL in migrations or `$queryRaw` in code. Prisma's abstraction layer does not expose these natively.

### Risks

- **Prisma version upgrades may introduce breaking changes**: Prisma is under active development and occasionally introduces breaking changes in the schema language or client API. **Mitigation**: Pin Prisma to a specific minor version (e.g., `~5.20.0`) and test upgrades in CI before adopting.

- **Connection pool exhaustion under load**: If Prisma's internal pool size is misconfigured (too small for the TPS target or too large for PostgreSQL's max_connections), the system may fail under load. **Mitigation**: Set `connection_limit=5` per pod, monitor pool utilization with Prisma metrics, and use RDS Proxy in production to multiplex connections.

- **$queryRaw SQL injection if misused**: Although tagged template literals are safe, a developer could accidentally use string interpolation (`$queryRaw(\`SELECT ... ${userId}\`)` with backtick template vs. `$queryRaw\`SELECT ... ${userId}\`` as tagged template). **Mitigation**: Add an ESLint rule or code review checklist item to flag `$queryRaw(` calls that are not tagged templates. The security research document (`docs/research/02-security-practices.md`, Section 2) provides detailed guidance.

- **Performance overhead for complex queries**: Prisma generates SQL that may not be optimal for complex joins or aggregations. **Mitigation**: Use `$queryRaw` for performance-critical queries (fraud velocity checks with window functions) and profile query performance with Prisma's query event logging.

## References

- Prisma Documentation: Getting Started with NestJS. https://www.prisma.io/docs/getting-started/setup-prisma/start-from-scratch/relational-databases/nestjs-typescript-postgresql
- Prisma Documentation: Transactions and Batch Queries. https://www.prisma.io/docs/concepts/components/prisma-client/transactions
- Prisma Documentation: Raw Database Access. https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access
- Prisma Documentation: Connection Pool Management. https://www.prisma.io/docs/concepts/components/prisma-client/working-with-prismaclient/connection-pool
- Research document: `docs/research/01-architecture-patterns.md` -- Repository pattern with Prisma (Section 4)
- Research document: `docs/research/02-security-practices.md` -- SQL injection prevention with Prisma (Section 2)
- Research document: `docs/research/00-executive-summary.md` -- Technology decisions summary
- Steering document: `.claude/steering/tech.md` -- Tech stack specification
