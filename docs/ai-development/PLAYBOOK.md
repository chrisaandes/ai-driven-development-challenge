# 🚀 Guía Completa: AI-Driven Development para Refácil Wallet

## Tabla de Contenidos
1. [Prerequisitos](#prerequisitos)
2. [Setup Inicial](#setup-inicial)
3. [Fase 1: Research Paralelo](#fase-1-research-paralelo)
4. [Fase 2: Diseño de Arquitectura](#fase-2-diseño-de-arquitectura)
5. [Fase 3: Implementación Paralela](#fase-3-implementación-paralela)
6. [Fase 4: Testing Paralelo](#fase-4-testing-paralelo)
7. [Fase 5: Infraestructura Paralela](#fase-5-infraestructura-paralela)
8. [Fase 6: Documentación Final](#fase-6-documentación-final)

---

## Prerequisitos

```bash
# Verificar instalaciones
node --version    # v20+
npm --version     # v10+
docker --version  # v24+
git --version     # v2.40+

# Instalar Claude Code si no lo tienes
npm install -g @anthropic-ai/claude-code

# Verificar Claude Code
claude --version
```

---

## Setup Inicial

### Paso 1: Crear estructura del proyecto

```bash
# Crear directorio y entrar
mkdir refacil-wallet && cd refacil-wallet

# Inicializar git
git init

# Crear estructura de directorios
mkdir -p .claude/{steering,specs/{01-core-transactions,02-fraud-detection,03-infrastructure},agents,commands}
mkdir -p docs/research
mkdir -p src/{domain/{entities,value-objects,interfaces,services,events},application/{use-cases,dtos,services},infrastructure/{database,repositories,services},presentation/{controllers,filters,decorators}}
mkdir -p terraform
mkdir -p k8s
mkdir -p scripts

# Crear archivos vacíos para la estructura
touch .gitignore
touch docker-compose.yml
touch Dockerfile
```

### Paso 2: Crear .gitignore

```bash
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnpm-store/

# Build
dist/
build/

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log
npm-debug.log*

# Test
coverage/
.nyc_output/

# Terraform
.terraform/
*.tfstate
*.tfstate.*
*.tfvars

# Docker
.docker/

# Temp
tmp/
temp/
EOF
```

### Paso 3: Habilitar Agent Teams

```bash
# Agregar a tu shell profile (~/.bashrc o ~/.zshrc)
echo 'export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1' >> ~/.zshrc
source ~/.zshrc

# O ejecutar directamente antes de cada sesión
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

---

## Archivos de Configuración Claude Code

### Copiar todos los archivos de configuración

Los archivos están organizados en la carpeta `claude-config/` de esta guía.
Copia cada uno a su ubicación correspondiente en tu proyecto.

```bash
# Desde el directorio del proyecto
cp claude-config/CLAUDE.md ./CLAUDE.md
cp claude-config/steering/* ./.claude/steering/
cp claude-config/agents/* ./.claude/agents/
cp claude-config/specs/01-core-transactions/* ./.claude/specs/01-core-transactions/
cp claude-config/specs/02-fraud-detection/* ./.claude/specs/02-fraud-detection/
cp claude-config/specs/03-infrastructure/* ./.claude/specs/03-infrastructure/
cp claude-config/commands/* ./.claude/commands/
```

---

## Fase 1: Research Paralelo (30 minutos)

### Objetivo
Usar 4 agentes en paralelo para investigar best practices antes de implementar.

### Prompt para Claude Code

```
Inicia Claude Code en el directorio del proyecto:
$ claude

Luego ejecuta este prompt:
```

```
Read CLAUDE.md and all files in .claude/steering/ to understand the project context.

I need parallel research before implementation. This is for a technical assessment 
where AI-driven development methodology is being evaluated.

Create 4 research subagents running in parallel:

**Agent 1 - "architecture-researcher":**
Research NestJS + Clean Architecture patterns for financial transaction services.
Focus on:
- Layer separation (domain, application, infrastructure, presentation)
- Dependency injection patterns
- Error handling strategies
- Repository pattern implementation
Output to: docs/research/01-architecture-patterns.md

**Agent 2 - "security-researcher":**
Research security best practices for financial transaction processing.
Focus on:
- Input validation strategies
- SQL injection prevention with Prisma
- Race condition handling in balance updates
- Audit logging requirements
- OWASP guidelines for financial apps
Output to: docs/research/02-security-practices.md

**Agent 3 - "fraud-researcher":**
Research fraud detection algorithms for digital wallets.
Focus on:
- Velocity checks (transactions per time window)
- Amount threshold detection
- Pattern recognition for suspicious behavior
- Configurable rule engines
- Real-time vs batch detection
Output to: docs/research/03-fraud-detection.md

**Agent 4 - "devops-researcher":**
Research Kubernetes and Terraform deployment for financial microservices.
Focus on:
- HPA configuration for transaction spikes
- Health checks and readiness probes
- Secrets management
- Zero-downtime deployments
- AWS RDS + EKS best practices
Output to: docs/research/04-infrastructure.md

Run all 4 in parallel. When complete, synthesize the key findings into 
docs/research/00-executive-summary.md
```

### Resultado Esperado
```
docs/research/
├── 00-executive-summary.md
├── 01-architecture-patterns.md
├── 02-security-practices.md
├── 03-fraud-detection.md
└── 04-infrastructure.md
```

### Commit después de Research
```bash
git add .
git commit -m "docs(research): parallel AI research on architecture, security, fraud, and devops

- 4 agents researched in parallel
- Architecture: Clean Architecture patterns for NestJS
- Security: Financial transaction security practices
- Fraud: Detection algorithms for digital wallets
- DevOps: K8s + Terraform for financial services

AI-Driven: Research phase with parallel subagents"
```

---

## Fase 2: Diseño de Arquitectura (45 minutos)

### Objetivo
Usar el agente arquitecto para diseñar la solución basada en el research.

### Prompt para Claude Code

```
Research phase complete. Now I need architectural design.

Read the research outputs in docs/research/ and the specs in .claude/specs/01-core-transactions/

Use the architect subagent to create a comprehensive technical design:

1. **Domain Model Design**
   - Entity definitions with all properties and behaviors
   - Value Objects for type safety
   - Domain events for cross-boundary communication
   - Repository interfaces (ports)
   Output to: .claude/specs/01-core-transactions/design.md

2. **Database Schema Design**
   - Prisma schema with all models
   - Indexes for performance
   - Constraints for data integrity
   Output to: .claude/specs/01-core-transactions/database-schema.prisma

3. **API Contract Design**
   - OpenAPI-style endpoint specifications
   - Request/Response DTOs
   - Error response formats
   Output to: .claude/specs/01-core-transactions/api-contract.md

4. **Architecture Decision Records**
   - Key decisions with rationale
   - Alternatives considered
   - Consequences
   Output to: docs/architecture/decisions/

Ensure the design follows Clean Architecture principles from the steering documents.
```

### Resultado Esperado
```
.claude/specs/01-core-transactions/
├── requirements.md (ya existe)
├── design.md
├── database-schema.prisma
├── api-contract.md
└── tasks.md (generado automáticamente)

docs/architecture/decisions/
├── ADR-001-clean-architecture.md
├── ADR-002-prisma-orm.md
├── ADR-003-error-handling.md
└── ADR-004-transaction-atomicity.md
```

### Commit después de Diseño
```bash
git add .
git commit -m "docs(architecture): complete technical design for transaction processing

- Domain model with Transaction, Wallet, Money value object
- Prisma schema with indexes and constraints
- REST API contract with OpenAPI specs
- 4 Architecture Decision Records

AI-Driven: Architect subagent designed the solution"
```

---

## Fase 3: Implementación Paralela (2 horas)

### Objetivo
Crear un Agent Team con 4 agentes trabajando en paralelo en cada capa.

### Prompt para Claude Code

```
Design phase complete. Now implement the transaction processing feature.

Read:
- .claude/specs/01-core-transactions/design.md
- .claude/specs/01-core-transactions/database-schema.prisma
- .claude/specs/01-core-transactions/api-contract.md

Create an agent team named "wallet-core" to implement in parallel:

**Team Structure:**
- Team Lead (you): Orchestrate, review, and integrate
- Teammate "domain-dev": Domain layer specialist
- Teammate "application-dev": Application layer specialist  
- Teammate "infrastructure-dev": Infrastructure layer specialist
- Teammate "api-dev": Presentation layer specialist

**Task Assignment:**

Wave 1 (Start Immediately - No Dependencies):
- domain-dev: 
  - Create src/domain/entities/transaction.entity.ts
  - Create src/domain/entities/wallet.entity.ts
  - Create src/domain/value-objects/money.vo.ts
  - Create src/domain/value-objects/transaction-type.vo.ts
  - Create src/domain/interfaces/transaction.repository.ts
  - Create src/domain/interfaces/wallet.repository.ts
  - Create src/domain/events/transaction-processed.event.ts

- infrastructure-dev (can start in parallel):
  - Initialize NestJS project with: nest new . --package-manager npm --skip-git
  - Setup Prisma: npm install prisma @prisma/client
  - Create prisma/schema.prisma from design spec
  - Run prisma generate

Wave 2 (After Domain Interfaces Ready):
- application-dev:
  - Create src/application/use-cases/process-transaction.use-case.ts
  - Create src/application/use-cases/get-balance.use-case.ts
  - Create src/application/use-cases/get-transaction-history.use-case.ts
  - Create src/application/dtos/ for each use case

- infrastructure-dev:
  - Create src/infrastructure/repositories/prisma-transaction.repository.ts
  - Create src/infrastructure/repositories/prisma-wallet.repository.ts
  - Create src/infrastructure/database/prisma.service.ts

Wave 3 (After Use Cases Ready):
- api-dev:
  - Create src/presentation/controllers/transaction.controller.ts
  - Create src/presentation/controllers/wallet.controller.ts
  - Create src/presentation/filters/http-exception.filter.ts
  - Create src/presentation/decorators/api-response.decorator.ts
  - Setup Swagger documentation

**Coordination Rules:**
1. domain-dev completes first - others depend on interfaces
2. Message team lead when blocked
3. Each file must have corresponding .spec.ts test file
4. Follow code standards in CLAUDE.md

Begin parallel implementation. Update the shared task list as you progress.
```

### Monitorear Progreso

Durante la ejecución, puedes ver el progreso en:
- Terminal: Claude muestra los panes de tmux con cada agente
- Task list: `.claude/teams/wallet-core/tasks.md`
- Messages: `.claude/teams/wallet-core/inboxes/`

### Comandos Útiles Durante Implementación

```bash
# Ver estado de los agentes (en otra terminal)
cat .claude/teams/wallet-core/tasks.md

# Ver mensajes del team lead
cat .claude/teams/wallet-core/inboxes/team-lead.json

# Si un agente se traba, puedes darle instrucciones
# En Claude Code:
> Send message to domain-dev: Focus on completing the Transaction entity first
```

### Resultado Esperado
```
src/
├── domain/
│   ├── entities/
│   │   ├── transaction.entity.ts
│   │   ├── transaction.entity.spec.ts
│   │   ├── wallet.entity.ts
│   │   └── wallet.entity.spec.ts
│   ├── value-objects/
│   │   ├── money.vo.ts
│   │   ├── money.vo.spec.ts
│   │   ├── transaction-type.vo.ts
│   │   └── transaction-type.vo.spec.ts
│   ├── interfaces/
│   │   ├── transaction.repository.ts
│   │   └── wallet.repository.ts
│   └── events/
│       └── transaction-processed.event.ts
├── application/
│   ├── use-cases/
│   │   ├── process-transaction.use-case.ts
│   │   ├── process-transaction.use-case.spec.ts
│   │   ├── get-balance.use-case.ts
│   │   ├── get-balance.use-case.spec.ts
│   │   ├── get-transaction-history.use-case.ts
│   │   └── get-transaction-history.use-case.spec.ts
│   └── dtos/
│       ├── process-transaction.dto.ts
│       ├── balance-response.dto.ts
│       └── transaction-history.dto.ts
├── infrastructure/
│   ├── database/
│   │   └── prisma.service.ts
│   └── repositories/
│       ├── prisma-transaction.repository.ts
│       ├── prisma-transaction.repository.spec.ts
│       ├── prisma-wallet.repository.ts
│       └── prisma-wallet.repository.spec.ts
└── presentation/
    ├── controllers/
    │   ├── transaction.controller.ts
    │   ├── transaction.controller.spec.ts
    │   ├── wallet.controller.ts
    │   └── wallet.controller.spec.ts
    ├── filters/
    │   └── http-exception.filter.ts
    └── decorators/
        └── api-response.decorator.ts
```

### Commits durante Implementación

```bash
# Después de Wave 1
git add src/domain/
git commit -m "feat(domain): implement core domain layer

- Transaction and Wallet entities with business logic
- Money and TransactionType value objects
- Repository interfaces (ports)
- Domain events for transaction processing

AI-Driven: domain-dev agent, Wave 1 parallel execution"

# Después de Wave 2
git add src/application/ src/infrastructure/
git commit -m "feat(application,infrastructure): implement use cases and repositories

- ProcessTransaction, GetBalance, GetHistory use cases
- Prisma repository implementations
- DTOs with validation

AI-Driven: application-dev + infrastructure-dev agents, Wave 2 parallel"

# Después de Wave 3
git add src/presentation/
git commit -m "feat(presentation): implement REST API layer

- Transaction and Wallet controllers
- Swagger documentation
- Exception filters
- Request validation

AI-Driven: api-dev agent, Wave 3 parallel execution"
```

---

## Fase 4: Testing Paralelo (1 hora)

### Objetivo
3 agentes de testing trabajando en paralelo en diferentes niveles.

### Prompt para Claude Code

```
Implementation complete. Now comprehensive testing phase.

Read the implementation in src/ and understand the code structure.

Spin up 3 testing subagents in parallel:

**Agent 1 - "unit-tester":**
Create comprehensive unit tests for the domain layer.
Focus on:
- All entity methods and edge cases
- Value object validation
- Domain service logic
- 100% coverage target for domain/

Output structure:
- src/domain/**/*.spec.ts (co-located with source)

Test patterns:
- describe/it blocks organized by method
- Arrange-Act-Assert pattern
- Edge cases: null, undefined, negative numbers, max values
- Error cases: invalid inputs, business rule violations

**Agent 2 - "integration-tester":**
Create integration tests for use cases with real database.
Focus on:
- Use case happy paths
- Error handling paths
- Transaction atomicity
- Concurrent access scenarios

Setup:
- Use testcontainers for PostgreSQL
- Create test utilities for database seeding
- Implement transaction rollback after each test

Output to: test/integration/

**Agent 3 - "e2e-tester":**
Create end-to-end API tests.
Focus on:
- All REST endpoints
- Request validation (400 errors)
- Business errors (422 errors)
- Not found errors (404)
- Success responses with correct format

Setup:
- Use supertest with NestJS testing module
- Test database isolation
- API response schema validation

Output to: test/e2e/

Run all 3 in parallel. When complete, generate coverage report and 
output summary to docs/testing/coverage-report.md
```

### Resultado Esperado
```
src/domain/**/*.spec.ts          # Unit tests (co-located)
test/
├── integration/
│   ├── setup.ts
│   ├── process-transaction.integration.spec.ts
│   ├── get-balance.integration.spec.ts
│   └── get-history.integration.spec.ts
├── e2e/
│   ├── setup.ts
│   ├── transaction.e2e.spec.ts
│   └── wallet.e2e.spec.ts
└── utils/
    ├── test-database.ts
    └── factories.ts

docs/testing/
└── coverage-report.md
```

### Commit después de Testing
```bash
git add test/ src/**/*.spec.ts docs/testing/
git commit -m "test: comprehensive test suite with parallel test agents

- Unit tests: 100% domain coverage
- Integration tests: use cases with testcontainers
- E2E tests: full API coverage

Coverage: 87% overall
AI-Driven: 3 parallel testing agents (unit, integration, e2e)"
```

---

## Fase 5: Infraestructura Paralela (1 hora)

### Objetivo
4 agentes trabajando en Docker, K8s, Terraform, y CI/CD simultáneamente.

### Prompt para Claude Code

```
Testing complete. Now infrastructure setup.

Create an agent team named "infra-team" for infrastructure:

**All agents can work in parallel - no dependencies between them.**

**Teammate "docker-dev":**
Create production-ready Docker setup:
- Dockerfile with multi-stage build (dev, build, prod)
- docker-compose.yml for local development
- docker-compose.test.yml for testing
- .dockerignore

Requirements:
- Node 20 Alpine base
- Non-root user
- Health check endpoint
- Optimized layer caching

Output to: Dockerfile, docker-compose*.yml

**Teammate "k8s-dev":**
Create Kubernetes manifests:
- Deployment with resource limits
- Service (ClusterIP)
- ConfigMap for configuration
- Secret template for sensitive data
- HorizontalPodAutoscaler
- Ingress (optional)
- NetworkPolicy

Requirements:
- Readiness and liveness probes
- Rolling update strategy
- Pod disruption budget
- Resource requests/limits

Output to: k8s/

**Teammate "terraform-dev":**
Create Terraform for AWS deployment:
- VPC with public/private subnets
- EKS cluster
- RDS PostgreSQL
- ECR repository
- IAM roles and policies
- Security groups

Requirements:
- Modular structure
- Variables for environment
- Outputs for important values
- State backend configuration

Output to: terraform/

**Teammate "cicd-dev":**
Create GitHub Actions workflow:
- CI: lint, test, build on PR
- CD: deploy to staging on merge to develop
- CD: deploy to production on merge to main
- Security scanning with trivy
- Dependency caching

Output to: .github/workflows/

Begin parallel infrastructure setup.
```

### Resultado Esperado
```
Dockerfile
docker-compose.yml
docker-compose.test.yml
.dockerignore

k8s/
├── namespace.yaml
├── configmap.yaml
├── secret.yaml
├── deployment.yaml
├── service.yaml
├── hpa.yaml
├── ingress.yaml
└── network-policy.yaml

terraform/
├── main.tf
├── variables.tf
├── outputs.tf
├── providers.tf
├── vpc.tf
├── eks.tf
├── rds.tf
├── ecr.tf
├── iam.tf
└── security-groups.tf

.github/workflows/
├── ci.yml
├── cd-staging.yml
└── cd-production.yml
```

### Commit después de Infraestructura
```bash
git add Dockerfile docker-compose* .dockerignore k8s/ terraform/ .github/
git commit -m "infra: complete infrastructure setup with parallel agents

- Docker: multi-stage build, compose for dev/test
- Kubernetes: full manifest set with HPA
- Terraform: AWS EKS + RDS infrastructure
- CI/CD: GitHub Actions for full pipeline

AI-Driven: 4 parallel infrastructure agents"
```

---

## Fase 6: Fraud Detection Feature (45 minutos)

### Objetivo
Agregar feature incremental usando el mismo flujo.

### Prompt para Claude Code

```
Core feature complete. Now add fraud detection as an incremental feature.

Read .claude/specs/02-fraud-detection/requirements.md

Use the same parallel implementation pattern:

**Wave 1 - Domain:**
- domain-dev: Create fraud detection domain service
  - src/domain/services/fraud-detection.service.ts
  - Velocity check: max N transactions in T minutes
  - Amount threshold: flag transactions above X
  - Consecutive high amounts: detect patterns

**Wave 2 - Application:**
- application-dev: Integrate fraud detection into ProcessTransaction use case
  - Add fraud check before processing
  - Create FraudAlert entity and events
  - Add alerting use case

**Wave 3 - Infrastructure:**
- infrastructure-dev: Add logging and alerting
  - Structured logging for fraud events
  - Alert repository for persistence

**Wave 4 - Presentation:**
- api-dev: Add fraud management endpoints
  - GET /fraud/alerts - list recent alerts
  - GET /fraud/alerts/:userId - alerts by user
  - PUT /fraud/alerts/:id/resolve - mark as resolved

Implement with tests for each component.
```

### Commit después de Fraud Detection
```bash
git add .
git commit -m "feat(fraud): implement fraud detection system

- Velocity checks for rapid transactions
- Amount threshold detection
- Consecutive high-amount pattern recognition
- Alert management API

AI-Driven: Incremental feature with parallel agents"
```

---

## Fase 7: Documentación Final (30 minutos)

### Prompt para Claude Code

```
Project complete. Now create comprehensive documentation.

Generate the following documentation:

1. **README.md** - Complete project documentation including:
   - Project overview
   - AI-Driven Development methodology used
   - Setup instructions
   - API documentation
   - Architecture overview
   - **Respuestas a las preguntas conceptuales** (from the technical assessment)

2. **docs/AI_DRIVEN_PROCESS.md** - Detailed documentation of the AI process:
   - Methodology explanation
   - Tools and agents used
   - Parallel execution metrics
   - Session logs
   - Prompts used for each phase
   - Lessons learned

3. **docs/ARCHITECTURE.md** - Technical architecture documentation:
   - Clean Architecture layers
   - Domain model
   - Data flow diagrams
   - Sequence diagrams (mermaid)

4. **docs/API.md** - API documentation:
   - All endpoints
   - Request/Response examples
   - Error codes

Include metrics:
- Total development time
- Parallel speedup achieved
- Test coverage
- Lines of code
- Number of agent sessions
```

### Commit Final
```bash
git add .
git commit -m "docs: complete project documentation

- README with setup and conceptual answers
- AI-Driven Process documentation
- Architecture documentation
- API documentation

AI-Driven: Documentation generated with Claude"

# Tag release
git tag -a v1.0.0 -m "Initial release - AI-Driven Development demonstration"
```

---

## Checklist Final

```
□ Research paralelo completado (4 agents)
□ Diseño de arquitectura completado
□ Implementación paralela completada (4 agents)
□ Testing paralelo completado (3 agents)
□ Infraestructura paralela completada (4 agents)
□ Fraud detection feature agregado
□ Documentación completa
□ Todos los tests pasan
□ Docker build funciona
□ README tiene respuestas conceptuales
□ docs/AI_DRIVEN_PROCESS.md documenta la metodología
□ Commits semánticos con referencias a agentes AI
□ Repositorio publicado en GitHub
```

---

## Métricas Esperadas

| Métrica | Valor Esperado |
|---------|----------------|
| Tiempo Total | ~6-8 horas |
| Tiempo Equivalente Manual | ~20-25 horas |
| Speedup | 3-4x |
| Sesiones de Agentes | 15-20 |
| Cobertura de Tests | >85% |
| Archivos Generados | ~50-60 |
| Líneas de Código | ~3000-4000 |
