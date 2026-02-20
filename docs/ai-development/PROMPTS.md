# 📝 Prompts para AI-Driven Development

Esta colección contiene todos los prompts optimizados para cada fase del desarrollo.
Copia y pega directamente en Claude Code.

---

## Fase 1: Research Paralelo

### Prompt 1.1: Iniciar Research con 4 Agentes

```
Read CLAUDE.md and all files in .claude/steering/ to understand the project context.

I need parallel research before implementation. This is for a technical assessment 
where AI-driven development methodology is being evaluated.

Create 4 research subagents running in parallel:

**Agent 1 - "architecture-researcher":**
Research NestJS + Clean Architecture patterns for financial transaction services.
Focus on:
- Layer separation (domain, application, infrastructure, presentation)
- Dependency injection patterns in NestJS
- Error handling strategies (Result pattern vs exceptions)
- Repository pattern implementation with Prisma
Output to: docs/research/01-architecture-patterns.md

**Agent 2 - "security-researcher":**
Research security best practices for financial transaction processing.
Focus on:
- Input validation strategies with class-validator
- SQL injection prevention with Prisma ORM
- Race condition handling in balance updates (optimistic vs pessimistic locking)
- Audit logging requirements for financial systems
- OWASP guidelines for fintech applications
Output to: docs/research/02-security-practices.md

**Agent 3 - "fraud-researcher":**
Research fraud detection algorithms for digital wallets.
Focus on:
- Velocity checks (transactions per time window)
- Amount threshold detection
- Pattern recognition for suspicious behavior
- Configurable rule engines
- Real-time vs batch detection tradeoffs
Output to: docs/research/03-fraud-detection.md

**Agent 4 - "devops-researcher":**
Research Kubernetes and Terraform deployment for financial microservices.
Focus on:
- HPA configuration for transaction spikes
- Health checks and readiness probes
- Secrets management in K8s
- Zero-downtime deployments
- AWS RDS + EKS best practices
Output to: docs/research/04-infrastructure.md

Run all 4 in parallel. When complete, synthesize the key findings into 
docs/research/00-executive-summary.md with actionable recommendations for our project.
```

---

## Fase 2: Diseño de Arquitectura

### Prompt 2.1: Crear Diseño Técnico Completo

```
Research phase complete. Now I need comprehensive architectural design.

Read:
- All research outputs in docs/research/
- Requirements in .claude/specs/01-core-transactions/requirements.md
- Architecture guidelines in .claude/steering/architecture.md

Use the architect subagent to create:

**1. Domain Model Design**
- Transaction entity with full behavior (deposit, withdraw methods)
- Wallet entity with balance management
- Money value object for type-safe amounts
- TransactionType value object
- Domain events (TransactionProcessed, FraudDetected)
- Repository interfaces (IWalletRepository, ITransactionRepository)

Output to: .claude/specs/01-core-transactions/design.md

**2. Database Schema**
- Prisma schema with all models
- Proper indexes for query patterns
- Constraints for data integrity
- Enum definitions

Output to: .claude/specs/01-core-transactions/database-schema.prisma

**3. API Contract**
- OpenAPI-style endpoint specifications
- Request/Response DTOs with validation rules
- Error response formats with codes
- Example requests and responses

Output to: .claude/specs/01-core-transactions/api-contract.md

**4. Architecture Decision Records**
For each major decision, document:
- Context and problem
- Decision made
- Alternatives considered
- Consequences

Create ADRs for:
- ADR-001: Clean Architecture layers
- ADR-002: Prisma ORM selection
- ADR-003: Error handling strategy (Result pattern)
- ADR-004: Transaction atomicity approach

Output to: docs/architecture/decisions/

Ensure all designs follow Clean Architecture principles from steering documents.
```

---

## Fase 3: Implementación Paralela

### Prompt 3.1: Bootstrap del Proyecto NestJS

```
Design phase complete. Now bootstrap the NestJS project.

First, initialize the project:
1. Run: npx @nestjs/cli new . --package-manager npm --skip-git
2. Install dependencies:
   - npm install @prisma/client class-validator class-transformer @nestjs/swagger swagger-ui-express
   - npm install -D prisma @types/node jest @nestjs/testing supertest @types/supertest
3. Initialize Prisma: npx prisma init
4. Copy the schema from .claude/specs/01-core-transactions/database-schema.prisma to prisma/schema.prisma
5. Run: npx prisma generate

Setup the module structure following Clean Architecture:
- Create src/domain/domain.module.ts
- Create src/application/application.module.ts
- Create src/infrastructure/infrastructure.module.ts
- Create src/presentation/presentation.module.ts
- Update src/app.module.ts to import all modules

Verify the setup compiles: npm run build
```

### Prompt 3.2: Implementación Paralela con Agent Team

```
Project bootstrapped. Now implement the core transaction feature with parallel agents.

Read:
- .claude/specs/01-core-transactions/design.md
- .claude/specs/01-core-transactions/api-contract.md
- .claude/steering/architecture.md

Create an agent team named "wallet-core" to implement in parallel:

**Team Structure:**
- Team Lead (you): Orchestrate, review, integrate
- Teammate "domain-dev": Domain layer specialist
- Teammate "application-dev": Application layer specialist
- Teammate "infrastructure-dev": Infrastructure layer specialist
- Teammate "api-dev": Presentation layer specialist

**Wave 1 - Start Immediately (No Dependencies):**

domain-dev tasks:
- src/domain/common/result.ts (Result pattern)
- src/domain/value-objects/money.vo.ts + tests
- src/domain/value-objects/transaction-type.vo.ts + tests
- src/domain/entities/transaction.entity.ts + tests
- src/domain/entities/wallet.entity.ts + tests
- src/domain/interfaces/wallet.repository.ts
- src/domain/interfaces/transaction.repository.ts
- src/domain/events/transaction-processed.event.ts
- src/domain/domain.module.ts

infrastructure-dev tasks (can start in parallel):
- Verify prisma/schema.prisma is correct
- src/infrastructure/database/prisma.service.ts
- Run: npx prisma migrate dev --name init

**Wave 2 - After Domain Interfaces Ready:**

application-dev tasks:
- src/application/exceptions/application.exception.ts
- src/application/dtos/process-transaction.dto.ts
- src/application/dtos/get-balance.dto.ts
- src/application/dtos/get-history.dto.ts
- src/application/use-cases/process-transaction.use-case.ts + tests
- src/application/use-cases/get-balance.use-case.ts + tests
- src/application/use-cases/get-transaction-history.use-case.ts + tests
- src/application/application.module.ts

infrastructure-dev tasks:
- src/infrastructure/repositories/prisma-wallet.repository.ts + tests
- src/infrastructure/repositories/prisma-transaction.repository.ts + tests
- src/infrastructure/infrastructure.module.ts

**Wave 3 - After Application Layer Ready:**

api-dev tasks:
- src/presentation/dtos/transaction.dto.ts (request/response with validation)
- src/presentation/dtos/wallet.dto.ts
- src/presentation/filters/http-exception.filter.ts
- src/presentation/controllers/transaction.controller.ts + tests
- src/presentation/controllers/wallet.controller.ts + tests
- src/presentation/controllers/health.controller.ts
- src/presentation/presentation.module.ts
- Update src/main.ts with Swagger and global filters

**Coordination Rules:**
1. domain-dev completes first - others depend on interfaces
2. Message team lead when blocked or when wave complete
3. Each file MUST have corresponding .spec.ts test file
4. Follow code standards in CLAUDE.md strictly
5. Use JSDoc on all public methods

Begin parallel implementation. Update shared task list as you progress.
```

---

## Fase 4: Testing Paralelo

### Prompt 4.1: Testing Comprehensivo con 3 Agentes

```
Implementation complete. Now comprehensive testing phase.

Read the implementation in src/ to understand the code structure.

Spin up 3 testing subagents in parallel:

**Agent 1 - "unit-tester":**
Create comprehensive unit tests for the domain layer.
Focus on:
- All entity methods with multiple scenarios
- Value object validation and edge cases
- Domain service logic
- 100% coverage target for src/domain/

Test patterns:
- describe/it blocks organized by method
- Arrange-Act-Assert pattern
- Edge cases: null, undefined, negative numbers, zero, max values
- Error cases: invalid inputs, business rule violations

Files to create/update:
- src/domain/entities/wallet.entity.spec.ts (expand existing)
- src/domain/entities/transaction.entity.spec.ts (expand existing)
- src/domain/value-objects/money.vo.spec.ts (expand existing)
- src/domain/value-objects/transaction-type.vo.spec.ts

**Agent 2 - "integration-tester":**
Create integration tests for use cases with real database.
Focus on:
- Use case happy paths with actual database
- Error handling paths
- Transaction atomicity verification
- Concurrent access scenarios

Setup:
- Use testcontainers for PostgreSQL
- Create test utilities in test/utils/
- Implement proper cleanup between tests

Files to create:
- test/utils/test-database.ts
- test/utils/factories.ts
- test/integration/process-transaction.integration.spec.ts
- test/integration/get-balance.integration.spec.ts
- test/integration/get-history.integration.spec.ts

**Agent 3 - "e2e-tester":**
Create end-to-end API tests.
Focus on:
- All REST endpoints
- Request validation (400 errors)
- Business errors (422 errors)
- Not found errors (404)
- Success responses with correct schema

Setup:
- Use supertest with NestJS testing module
- Test database isolation

Files to create:
- test/e2e/jest-e2e.json
- test/e2e/setup.ts
- test/e2e/transaction.e2e.spec.ts
- test/e2e/wallet.e2e.spec.ts
- test/e2e/health.e2e.spec.ts

Run all 3 in parallel. When complete:
1. Run: npm run test:cov
2. Generate coverage report to docs/testing/coverage-report.md
3. List any gaps or issues found
```

---

## Fase 5: Infraestructura Paralela

### Prompt 5.1: Setup de Infraestructura con 4 Agentes

```
Testing complete. Now infrastructure setup.

Create an agent team named "infra-team" for infrastructure:

**All agents can work in parallel - no dependencies between them.**

**Teammate "docker-dev":**
Create production-ready Docker setup:

Files to create:
- Dockerfile (multi-stage: dev, build, prod)
- docker-compose.yml (app + postgres for dev)
- docker-compose.test.yml (for CI testing)
- .dockerignore

Requirements:
- Node 20 Alpine base image
- Non-root user in production
- Health check on /health endpoint
- Optimized layer caching
- Development stage with hot reload

**Teammate "k8s-dev":**
Create Kubernetes manifests:

Files to create in k8s/:
- namespace.yaml
- configmap.yaml
- secret.yaml (template with placeholders)
- deployment.yaml
- service.yaml
- hpa.yaml
- ingress.yaml (optional, with annotations)
- network-policy.yaml

Requirements:
- Namespace: refacil-wallet
- 3 replicas default
- Resource limits: 512Mi memory, 500m CPU
- Readiness/liveness probes on /health
- Rolling update strategy
- HPA: 2-10 replicas, 70% CPU target

**Teammate "terraform-dev":**
Create Terraform for AWS:

Files to create in terraform/:
- main.tf (providers, backend)
- variables.tf
- outputs.tf
- vpc.tf (VPC, subnets, NAT)
- eks.tf (EKS cluster)
- rds.tf (PostgreSQL)
- ecr.tf (Container registry)
- iam.tf (Roles and policies)
- security-groups.tf
- terraform.tfvars.example

Requirements:
- Modular structure
- S3 backend for state
- Multi-AZ RDS
- Private subnets for workloads
- Encryption at rest

**Teammate "cicd-dev":**
Create GitHub Actions workflows:

Files to create in .github/workflows/:
- ci.yml (lint, test, build on PR)
- cd-staging.yml (deploy on develop push)
- cd-production.yml (deploy on main push)

Requirements:
- Cache npm dependencies
- Run tests with PostgreSQL service
- Build and push to ECR
- Trivy security scan
- Deployment with kubectl

Begin parallel infrastructure setup. Each agent works independently.
```

---

## Fase 6: Fraud Detection Feature

### Prompt 6.1: Agregar Feature Incremental

```
Core infrastructure complete. Now add fraud detection as an incremental feature.

Read .claude/specs/02-fraud-detection/requirements.md

Use the same parallel implementation pattern with agent team "fraud-team":

**Wave 1 - Domain:**
domain-dev tasks:
- src/domain/services/fraud-detection.service.ts
  - Velocity check: max N transactions in T minutes
  - Amount threshold: flag transactions above X
  - Configurable via constructor
- src/domain/entities/fraud-alert.entity.ts
- src/domain/events/fraud-detected.event.ts
- src/domain/interfaces/fraud-alert.repository.ts
- Tests for all new domain components

**Wave 2 - Application:**
application-dev tasks:
- Modify ProcessTransactionUseCase to call fraud detection after processing
- src/application/use-cases/list-fraud-alerts.use-case.ts
- src/application/use-cases/get-user-alerts.use-case.ts
- src/application/use-cases/resolve-alert.use-case.ts
- src/application/dtos/fraud-alert.dto.ts
- Tests for all use cases

**Wave 3 - Infrastructure:**
infrastructure-dev tasks:
- Add FraudAlert model to prisma/schema.prisma
- Run migration: npx prisma migrate dev --name add-fraud-alerts
- src/infrastructure/repositories/prisma-fraud-alert.repository.ts
- Tests for repository

**Wave 4 - Presentation:**
api-dev tasks:
- src/presentation/controllers/fraud.controller.ts
  - GET /api/v1/fraud/alerts
  - GET /api/v1/fraud/alerts/:userId
  - PUT /api/v1/fraud/alerts/:id/resolve
- src/presentation/dtos/fraud.dto.ts
- Update Swagger documentation
- E2E tests for fraud endpoints

Implement with tests for each component. Follow the same quality standards.
```

---

## Fase 7: Documentación Final

### Prompt 7.1: Generar Documentación Completa

```
Project complete. Generate comprehensive documentation.

**1. README.md**
Create a professional README including:
- Project overview and purpose
- AI-Driven Development methodology explanation
- Quick start guide
- API documentation summary
- Architecture overview (with diagram)
- Environment setup
- Testing instructions
- Deployment guide

IMPORTANT: Include the conceptual question answers from the technical assessment:

Question 1: ¿Cómo manejarías picos altos de transacciones para garantizar escalabilidad?
- Discuss horizontal scaling with K8s HPA
- Connection pooling
- Database optimizations (read replicas, partitioning)
- Event-driven architecture with queues
- Caching strategies

Question 2: ¿Qué estrategias usarías para prevenir fraudes en un sistema de billetera digital?
- Reference the implemented fraud detection
- Discuss additional strategies: ML models, device fingerprinting, geolocation
- Real-time vs batch processing tradeoffs

Question 3: Si detectas lentitud en el procesamiento por alta concurrencia, ¿cómo procederías?
- APM and monitoring setup
- Database query analysis
- Optimistic vs pessimistic locking
- Batch processing
- Async processing with queues

**2. docs/AI_DRIVEN_PROCESS.md**
Detailed documentation of the AI development process:
- Methodology explanation (Spec-Driven Development)
- Tools used (Claude Code, Agent Teams, Subagents)
- Parallel execution strategy and metrics
- Session log with timestamps
- Key prompts used
- Lessons learned

Include metrics:
- Total development time per phase
- Sequential vs parallel time comparison
- Number of agent sessions
- Test coverage achieved
- Lines of code generated

**3. docs/ARCHITECTURE.md**
Technical architecture documentation:
- Clean Architecture explanation
- Layer responsibilities
- Dependency diagram
- Domain model diagram (mermaid)
- Sequence diagrams for key flows
- Data flow diagrams

**4. docs/API.md**
Complete API documentation:
- All endpoints with descriptions
- Request/Response examples
- Error codes and messages
- Authentication notes (future)

Generate all documentation files.
```

---

## Comandos Útiles Durante el Desarrollo

### Ver Estado del Agent Team
```
Check the status of the wallet-core team. Show:
- Current task list with status
- Any blocked tasks
- Messages in team lead inbox
```

### Enviar Mensaje a un Teammate
```
Send message to domain-dev: Focus on completing the Wallet entity first, 
the other agents are waiting for the repository interface.
```

### Revisar Código Antes de Commit
```
Use the reviewer subagent to review all changes before committing.
Check for:
- Architecture violations
- Security issues
- Missing tests
- Code quality

Generate a review report.
```

### Generar Commit Message
```
Generate a semantic commit message for the current changes.
Include:
- Type (feat, fix, docs, test, refactor, chore, infra)
- Scope (domain, application, infrastructure, presentation)
- Description
- AI-Driven footer with agent name and context
```
