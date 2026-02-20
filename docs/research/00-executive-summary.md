# Executive Summary: Research Phase Findings

**Project**: Refacil Wallet - Digital Wallet Microservice
**Date**: 2026-02-20
**Phase**: 1 - Research (Parallel Execution)
**Agents**: architecture-researcher, security-researcher, fraud-researcher, devops-researcher

---

## Overview

Four parallel research agents investigated the key technical domains for the Refacil Wallet microservice. This document synthesizes their findings into actionable recommendations organized by implementation priority.

### Research Documents

| # | Document | Agent | Lines | Key Focus |
|---|----------|-------|-------|-----------|
| 01 | [Architecture Patterns](./01-architecture-patterns.md) | architecture-researcher | ~2,023 | Clean Architecture, DI, Result pattern, Prisma repository |
| 02 | [Security Practices](./02-security-practices.md) | security-researcher | ~1,935 | Input validation, race conditions, audit logging, OWASP |
| 03 | [Fraud Detection](./03-fraud-detection.md) | fraud-researcher | ~1,880 | Velocity checks, rule engine, hybrid detection, alerts |
| 04 | [Infrastructure](./04-infrastructure.md) | devops-researcher | ~2,610 | Docker, K8s, Terraform, CI/CD, AWS |

---

## Key Architectural Decisions

The following decisions emerged consistently across all four research streams:

| Decision | Choice | Rationale | Source |
|----------|--------|-----------|--------|
| **Money representation** | Integer cents (not floats) | Eliminates floating-point precision errors in financial calculations | 01, 02 |
| **Error handling** | Domain: `Result<T,E>` / Application: Exceptions / Presentation: ExceptionFilter | Each layer uses the appropriate error mechanism; domain stays pure | 01 |
| **Concurrency control** | Pessimistic locking (`SELECT ... FOR UPDATE`) | Strong consistency for financial operations at 1,000 TPS; PostgreSQL handles this well | 02 |
| **Idempotency** | Client-provided idempotency key + unique DB constraint | Ensures exactly-once processing for network retries | 01 |
| **Fraud detection timing** | Hybrid: sync for velocity/amount, async for pattern analysis | Balances latency (<200ms p99) with detection depth | 03 |
| **Fraud rule architecture** | Strategy pattern with `IFraudRule` interface | Extensible, testable, follows Clean Architecture | 03 |
| **Event publishing** | Collect events in entity, publish after persistence via EventEmitter2 | Ensures events only emitted for persisted state changes | 01, 03 |
| **DI tokens** | Centralized string constants (`INJECTION_TOKENS`) | Avoids magic strings, enables refactoring | 01 |
| **Docker** | Multi-stage Alpine build with `dumb-init` | Minimal image, proper signal handling for graceful shutdown | 04 |
| **K8s deployment** | Rolling update with `maxUnavailable: 0` | Zero downtime, simple rollback | 04 |
| **DB migrations** | Kubernetes Job (pre-deploy) | Run once, avoid N concurrent migrations | 04 |
| **Secrets** | External Secrets Operator + AWS Secrets Manager | Encrypted, auditable, auto-rotated | 04 |

---

## Actionable Recommendations by Phase

### Phase 2: Design (Next Step)

Based on the research findings, the architect agent should produce:

1. **Domain Model** with these entities:
   - `Wallet` (rich entity with `deposit()`/`withdraw()` returning `Result<T,E>`)
   - `Transaction` (entity with idempotency key, type, amount as `Money`)
   - `FraudAlert` (entity with lifecycle: OPEN -> ACKNOWLEDGED -> RESOLVED)
   - `Money` (value object storing integer cents)
   - `Result<T,E>` (common class with `ok()`, `fail()`, `map()`, `flatMap()`)

2. **Database Schema** (Prisma):
   - `wallets` table with `version` column for optimistic locking fallback
   - `transactions` table with unique constraint on `idempotency_key`
   - `fraud_alerts` table with JSONB `details` column
   - Composite indexes: `(user_id, created_at)` on transactions, `(user_id, status)` on alerts

3. **API Contracts** matching spec requirements:
   - `POST /api/v1/transactions` - idempotent transaction processing
   - `GET /api/v1/transactions?user_id=` - transaction history
   - `GET /api/v1/wallets/:userId/balance` - balance query
   - `GET /api/v1/fraud/alerts` - list alerts (filterable by resolved status)
   - `GET /api/v1/fraud/alerts/:userId` - alerts by user
   - `PUT /api/v1/fraud/alerts/:id/resolve` - resolve alert
   - `GET /health` - liveness, `GET /health/ready` - readiness (with DB check)

4. **Module Structure**:
   ```
   src/
   ├── domain/          # Zero framework dependencies
   │   ├── entities/    # Wallet, Transaction, FraudAlert
   │   ├── value-objects/ # Money
   │   ├── interfaces/  # IWalletRepository, ITransactionRepository, IFraudAlertRepository, IFraudRule
   │   ├── services/    # FraudAnalysisService (orchestrates rules)
   │   ├── errors/      # InsufficientFundsError, WalletNotFoundError, InvalidAmountError
   │   ├── events/      # TransactionCompletedEvent
   │   └── common/      # Result<T,E>
   ├── application/
   │   ├── use-cases/   # ProcessTransaction, GetBalance, GetHistory, ListAlerts, ResolveAlert
   │   ├── dtos/        # Input/Output DTOs
   │   ├── services/    # FraudDetectionService (application-level)
   │   ├── event-handlers/ # FraudCheckHandler, AuditLogHandler
   │   └── exceptions/  # ApplicationException
   ├── infrastructure/
   │   ├── database/    # PrismaService
   │   ├── repositories/ # PrismaWalletRepo, PrismaTransactionRepo, PrismaFraudAlertRepo
   │   └── config/      # configuration.ts
   └── presentation/
       ├── controllers/ # TransactionController, WalletController, FraudController, HealthController
       ├── filters/     # GlobalExceptionFilter
       └── middleware/   # CorrelationId, NoCache
   ```

### Phase 3: Implementation Priorities

#### Wave 1 - Core Domain (Parallel: domain-dev + infrastructure-dev)

| Task | Agent | Dependencies |
|------|-------|-------------|
| `Result<T,E>` class | domain-dev | None |
| `Money` value object (integer cents) | domain-dev | None |
| `Wallet` entity with deposit/withdraw | domain-dev | Result, Money |
| `Transaction` entity | domain-dev | Money |
| Repository interfaces (`IWalletRepository`, `ITransactionRepository`) | domain-dev | Entities |
| Domain errors | domain-dev | None |
| Prisma schema + migrations | infrastructure-dev | None |
| `PrismaService` with lifecycle hooks | infrastructure-dev | None |
| Repository implementations with pessimistic locking | infrastructure-dev | Domain interfaces, PrismaService |

#### Wave 2 - Application + Presentation (Parallel: application-dev + api-dev)

| Task | Agent | Dependencies |
|------|-------|-------------|
| `ProcessTransactionUseCase` (with idempotency) | application-dev | Wave 1 |
| `GetBalanceUseCase` | application-dev | Wave 1 |
| `GetTransactionHistoryUseCase` | application-dev | Wave 1 |
| `ApplicationException` + error mapping | application-dev | Domain errors |
| `TransactionController` with Swagger | api-dev | Use cases |
| `WalletController` with Swagger | api-dev | Use cases |
| `GlobalExceptionFilter` | api-dev | None |
| Request DTOs with class-validator | api-dev | None |
| `ValidationPipe` global config | api-dev | None |

#### Wave 3 - Fraud Detection (Parallel: domain-dev + application-dev + api-dev)

| Task | Agent | Dependencies |
|------|-------|-------------|
| `FraudAlert` entity | domain-dev | Wave 1 |
| `IFraudRule` interface + implementations (Velocity, Amount) | domain-dev | Wave 1 |
| `FraudAnalysisService` domain service | domain-dev | IFraudRule |
| `IFraudAlertRepository` + Prisma implementation | infrastructure-dev | FraudAlert entity |
| Event-driven fraud integration (`TransactionCompletedEvent`) | application-dev | Wave 2 |
| Alert use cases (List, GetByUser, Resolve) | application-dev | FraudAlert repo |
| `FraudController` with Swagger | api-dev | Alert use cases |

### Phase 4: Testing Strategy

| Test Type | Scope | Tools | Minimum Coverage |
|-----------|-------|-------|-----------------|
| Unit tests | Domain entities, value objects, services | Jest | 90%+ |
| Unit tests | Use cases (with mocked repos) | Jest | 80%+ |
| Integration tests | Repository implementations with real DB | Jest + Testcontainers | 80%+ |
| E2E tests | Full HTTP request/response cycle | Supertest | All endpoints |

### Phase 5: Infrastructure

| Priority | Component | Files |
|----------|-----------|-------|
| P0 | Dockerfile (multi-stage) | `Dockerfile` |
| P0 | docker-compose.yml (dev env) | `docker-compose.yml` |
| P0 | CI pipeline | `.github/workflows/ci.yml` |
| P0 | K8s core manifests | `k8s/{namespace,deployment,service,configmap}.yaml` |
| P1 | K8s scaling | `k8s/{hpa,pdb}.yaml` |
| P1 | Terraform modules | `terraform/modules/{vpc,eks,rds,ecr}/` |
| P1 | CD pipeline | `.github/workflows/cd-staging.yml` |
| P2 | Production CD | `.github/workflows/cd-production.yml` |

---

## Security Checklist (Cross-Cutting)

These security measures should be applied throughout all implementation phases:

### Critical (Block deployment without these)
- [ ] Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`
- [ ] Input validation on all DTOs with `class-validator`
- [ ] Pessimistic locking for balance updates (`SELECT ... FOR UPDATE`)
- [ ] Global exception filter (sanitize error responses, no stack traces)
- [ ] Prisma-only queries (no raw SQL string concatenation)
- [ ] Correlation ID middleware for request tracing

### High Priority (First sprint)
- [ ] Structured audit logging with Pino (PII redaction)
- [ ] Rate limiting with `@nestjs/throttler`
- [ ] Helmet security headers
- [ ] Custom financial amount validator (precision, range)
- [ ] `Money` value object enforcing invariants

### Medium Priority (Second sprint)
- [ ] Immutable audit trail (DB table)
- [ ] Dependency vulnerability scanning in CI (npm audit, Trivy)
- [ ] CORS configuration
- [ ] No-cache headers for financial endpoints

---

## Performance Targets & Sizing

| Metric | Target | Design Impact |
|--------|--------|---------------|
| Transaction processing latency | < 200ms p99 | Sync fraud checks must be < 50ms; use pessimistic locking |
| Balance query latency | < 50ms p99 | Direct DB query with index on `user_id` |
| Peak throughput | 1,000 TPS | 7-15 pods, connection pooling (5 per pod), partial indexes |
| Availability | 99.9% | Min 3 replicas across AZs, PDB `minAvailable: 2` |

### Pod Resource Sizing

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 250m | 500m |
| Memory | 256Mi | 512Mi |

---

## Technology Decisions Summary

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Runtime | Node.js | 20 LTS | Application runtime |
| Language | TypeScript | 5.3+ | Type safety, strict mode |
| Framework | NestJS | 10 | DI, modules, decorators |
| Database | PostgreSQL | 16 | ACID transactions, FOR UPDATE |
| ORM | Prisma | 5.x | Type-safe queries, migrations |
| Validation | class-validator | 0.14+ | Decorator-based DTO validation |
| Documentation | @nestjs/swagger | Latest | OpenAPI 3.0 auto-generation |
| Logging | Pino (nestjs-pino) | Latest | Structured JSON logging |
| Events | @nestjs/event-emitter | Latest | In-process async events |
| Rate limiting | @nestjs/throttler | 6.x | Per-endpoint rate limiting |
| Security headers | helmet | 8.x | OWASP security headers |
| Health checks | @nestjs/terminus | Latest | Liveness + readiness probes |
| Testing | Jest + Supertest + Testcontainers | Latest | Unit, integration, E2E |
| Container | Docker (Alpine) | Latest | Multi-stage builds |
| Orchestration | Kubernetes | Latest | HPA, PDB, rolling updates |
| IaC | Terraform | 1.x | AWS infrastructure |
| CI/CD | GitHub Actions | N/A | Automated pipelines |
| Cloud | AWS (EKS + RDS + ECR) | N/A | Production hosting |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pessimistic lock contention at peak TPS | Medium | High | Monitor lock wait times; fall back to optimistic locking if needed |
| EventEmitter2 in-process delivery failure | Low | Medium | Acceptable for MVP; add outbox pattern for production |
| Prisma ORM overhead for complex queries | Low | Low | Use `$queryRaw` with parameterized queries for hot paths |
| Concurrent wallet creation race condition | Medium | Medium | Use `upsert` with unique constraint on `user_id` |
| Fraud check adding latency to transactions | Medium | High | 50ms timeout + circuit breaker; degrade to async-only |
| Database connection exhaustion under load | Medium | High | Connection pooling (5/pod), RDS Proxy in production |
| Alpine image vulnerability | Low | Low | Regular base image updates, Trivy scanning in CI |

---

## Next Steps

1. **Phase 2: Design** - Use the architect agent to create the formal domain model, database schema, and API contracts based on these research findings
2. **Phase 3: Implementation** - Spin up parallel agent team (domain-dev, application-dev, infrastructure-dev, api-dev) following the wave-based execution plan above
3. **Phase 4: Testing** - Parallel testing agents (unit, integration, E2E) after each implementation wave
4. **Phase 5: Infrastructure** - Docker, K8s, Terraform, and CI/CD setup

---

> **Research Phase Status**: COMPLETE
> **Total Research Output**: ~8,448 lines across 4 documents + this summary
> **Execution Model**: 4 parallel agents, all completed successfully
> **Ready for**: Phase 2 - Design
