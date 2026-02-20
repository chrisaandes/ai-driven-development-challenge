# Refácil Wallet - AI-Driven Development Project

## Project Overview
Microservicio de billetera digital para procesamiento de transacciones financieras.
Este proyecto demuestra AI-Driven Development con Claude Code usando Spec-Driven Development
y ejecución paralela de agentes.

## Technical Assessment Context
- **Company**: Refácil
- **Position**: Senior Engineer
- **Key Evaluation**: AI-driven development methodology and tooling mastery

## Tech Stack
- **Runtime**: Node.js 20 LTS + TypeScript 5.3+
- **Framework**: NestJS 10
- **Database**: PostgreSQL 16 + Prisma ORM 5.x
- **Testing**: Jest + Supertest + Testcontainers
- **Validation**: class-validator + class-transformer
- **Documentation**: Swagger/OpenAPI 3.0
- **Infrastructure**: Docker, Kubernetes, Terraform (AWS)
- **CI/CD**: GitHub Actions

## Architecture: Clean Architecture (Ports & Adapters)

```
src/
├── domain/           # Enterprise Business Rules (innermost)
│   ├── entities/     # Business objects with behavior
│   ├── value-objects/# Immutable typed values
│   ├── interfaces/   # Repository ports (abstractions)
│   ├── services/     # Domain services (pure business logic)
│   └── events/       # Domain events
├── application/      # Application Business Rules
│   ├── use-cases/    # Application-specific logic
│   ├── dtos/         # Data transfer objects
│   └── services/     # Application services
├── infrastructure/   # Frameworks & Drivers (outermost)
│   ├── database/     # Prisma setup
│   ├── repositories/ # Repository implementations (adapters)
│   └── services/     # External service integrations
└── presentation/     # Interface Adapters
    ├── controllers/  # REST API controllers
    ├── filters/      # Exception filters
    └── decorators/   # Custom decorators
```

## Dependency Rule
Dependencies ONLY point inward:
- Presentation → Application → Domain
- Infrastructure → Domain (implements interfaces)
- Domain has ZERO external dependencies

## Code Standards

### Naming Conventions
- Files: `kebab-case.ts` (e.g., `transaction.entity.ts`)
- Classes: `PascalCase` (e.g., `TransactionEntity`)
- Interfaces: `PascalCase` with `I` prefix for ports (e.g., `ITransactionRepository`)
- Methods/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

### File Structure
```typescript
// 1. Imports (external, then internal)
// 2. Types/Interfaces (if small, otherwise separate file)
// 3. Class definition
// 4. Exports
```

### Documentation
- All public methods MUST have JSDoc comments
- Complex logic MUST have inline comments
- Each module MUST have a README.md

### Error Handling
- Domain: Return Result<T, Error> pattern (no throwing)
- Application: Throw custom ApplicationException
- Presentation: Global exception filter transforms to HTTP responses

### Testing
- Test file: `*.spec.ts` co-located with source
- Integration tests: `test/integration/`
- E2E tests: `test/e2e/`
- Minimum coverage: 80%

## AI Development Workflow

### Phase 1: Research (Parallel)
```
> Spin up 4 research subagents to investigate:
> 1. Architecture patterns
> 2. Security practices  
> 3. Fraud detection
> 4. Infrastructure
```

### Phase 2: Design
```
> Use architect agent to create:
> - Domain model design
> - Database schema
> - API contracts
> - Architecture decisions
```

### Phase 3: Implementation (Parallel Agent Team)
```
> Create agent team "wallet-core":
> - domain-dev: Domain layer
> - application-dev: Application layer
> - infrastructure-dev: Infrastructure layer
> - api-dev: Presentation layer
```

### Phase 4: Testing (Parallel)
```
> Spin up 3 testing agents:
> - unit-tester: Domain tests
> - integration-tester: Use case tests
> - e2e-tester: API tests
```

### Phase 5: Infrastructure (Parallel)
```
> Create agent team "infra-team":
> - docker-dev
> - k8s-dev
> - terraform-dev
> - cicd-dev
```

## Current Status
- [ ] Phase 1: Research
- [ ] Phase 2: Design
- [ ] Phase 3: Implementation
- [ ] Phase 4: Testing
- [ ] Phase 5: Infrastructure
- [ ] Phase 6: Fraud Detection Feature
- [ ] Phase 7: Documentation

## Important Commands
```bash
# Development
npm run start:dev       # Start in development mode
npm run test           # Run unit tests
npm run test:e2e       # Run e2e tests
npm run test:cov       # Run tests with coverage

# Database
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio

# Docker
docker-compose up -d     # Start local environment
docker-compose down      # Stop local environment

# Quality
npm run lint           # Run ESLint
npm run format         # Run Prettier
```

## Environment Variables
```
DATABASE_URL=postgresql://user:pass@localhost:5432/wallet
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
FRAUD_VELOCITY_WINDOW_MINUTES=5
FRAUD_VELOCITY_MAX_TRANSACTIONS=10
FRAUD_AMOUNT_THRESHOLD=10000
```

## API Endpoints
```
POST   /api/v1/transactions          # Process a transaction
GET    /api/v1/transactions          # Get transaction history (query: user_id)
GET    /api/v1/wallets/:userId/balance  # Get user balance
GET    /api/v1/fraud/alerts          # List fraud alerts
GET    /api/v1/fraud/alerts/:userId  # Get alerts by user
PUT    /api/v1/fraud/alerts/:id/resolve  # Resolve an alert
GET    /health                       # Health check
```

## Git Commit Convention
```
type(scope): description

AI-Driven: [agent name], [execution context]
```

Types: feat, fix, docs, test, refactor, chore, infra

Example:
```
feat(domain): implement Transaction entity with business rules

- Add deposit and withdraw methods
- Implement balance validation
- Add domain events

AI-Driven: domain-dev agent, Wave 1 parallel execution
```
