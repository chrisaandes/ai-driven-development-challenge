# 🎮 Guía de Slash Commands

Referencia rápida de todos los comandos disponibles para el desarrollo AI-driven de este proyecto.

---

## 📋 Resumen de Comandos

| Comando | Descripción | Agentes | Tiempo |
|---------|-------------|:-------:|:------:|
| `/research` | Research paralelo de best practices | 4 | 30 min |
| `/design` | Diseño técnico con architect | 1 | 45 min |
| `/bootstrap` | Inicializar proyecto NestJS | - | 15 min |
| `/implement` | Implementación paralela por capas | 4 | 2 hrs |
| `/test` | Testing paralelo | 3 | 1 hr |
| `/infra` | Docker, K8s, Terraform, CI/CD | 4 | 1 hr |
| `/fraud` | Feature de fraud detection | 4 | 45 min |
| `/review` | Code review antes de commit | 1 | 15 min |
| `/commit` | Generar commit message semántico | - | 1 min |
| `/status` | Ver progreso del proyecto | - | 1 min |
| `/docs` | Generar documentación final | - | 30 min |

---

## 🚀 Flujo Recomendado

```
/research → /design → /bootstrap → /implement → /test → /infra → /review → /commit → /docs
```

---

## 📖 Detalle de Cada Comando

### `/research`

**Propósito:** Ejecuta investigación paralela con 4 agentes antes de implementar.

**Agentes:**
- `architecture-researcher` → Clean Architecture patterns
- `security-researcher` → Security best practices
- `fraud-researcher` → Fraud detection algorithms
- `devops-researcher` → K8s/Terraform patterns

**Output:**
```
docs/research/
├── 00-executive-summary.md
├── 01-architecture-patterns.md
├── 02-security-practices.md
├── 03-fraud-detection.md
└── 04-infrastructure.md
```

**Uso:**
```
> /research
```

---

### `/design`

**Propósito:** Crear diseño técnico completo usando el subagent architect (Opus).

**Genera:**
- Domain model design
- Database schema (Prisma)
- API contract (OpenAPI style)
- Architecture Decision Records (ADRs)

**Output:**
```
.claude/specs/01-core-transactions/
├── design.md
├── database-schema.prisma
└── api-contract.md

docs/architecture/decisions/
├── ADR-001-clean-architecture.md
├── ADR-002-prisma-orm.md
├── ADR-003-error-handling.md
└── ADR-004-transaction-atomicity.md
```

**Uso:**
```
> /design
```

---

### `/bootstrap`

**Propósito:** Inicializar proyecto NestJS con estructura Clean Architecture.

**Ejecuta:**
1. `npx @nestjs/cli new . --package-manager npm --skip-git`
2. Instala dependencias (Prisma, class-validator, Swagger)
3. Inicializa Prisma
4. Crea módulos por capa
5. Verifica build

**Output:**
```
src/
├── domain/domain.module.ts
├── application/application.module.ts
├── infrastructure/infrastructure.module.ts
└── presentation/presentation.module.ts
```

**Uso:**
```
> /bootstrap
```

---

### `/implement`

**Propósito:** Implementación paralela con Agent Team de 4 agentes.

**Agent Team "wallet-core":**
- `domain-dev` → Entities, Value Objects, Interfaces
- `application-dev` → Use Cases, DTOs
- `infrastructure-dev` → Prisma Repositories
- `api-dev` → Controllers, Swagger

**Waves de Ejecución:**
```
Wave 1 (paralelo): domain-dev + infrastructure-dev (schema)
         ↓
Wave 2 (paralelo): application-dev + infrastructure-dev (repos)
         ↓
Wave 3: api-dev (controllers)
```

**Output:**
```
src/
├── domain/
│   ├── entities/*.ts + *.spec.ts
│   ├── value-objects/*.ts + *.spec.ts
│   └── interfaces/*.ts
├── application/
│   ├── use-cases/*.ts + *.spec.ts
│   └── dtos/*.ts
├── infrastructure/
│   ├── database/prisma.service.ts
│   └── repositories/*.ts + *.spec.ts
└── presentation/
    ├── controllers/*.ts + *.spec.ts
    └── dtos/*.ts
```

**Uso:**
```
> /implement
```

**Con contexto adicional:**
```
> /implement focus on domain layer first
```

---

### `/test`

**Propósito:** Testing paralelo con 3 agentes especializados.

**Agentes:**
- `unit-tester` → Domain layer (100% coverage target)
- `integration-tester` → Use cases con DB real (testcontainers)
- `e2e-tester` → API endpoints con supertest

**Output:**
```
src/domain/**/*.spec.ts          # Unit tests
test/integration/*.spec.ts        # Integration tests
test/e2e/*.spec.ts               # E2E tests
docs/testing/coverage-report.md   # Coverage report
```

**Uso:**
```
> /test
```

---

### `/infra`

**Propósito:** Setup de infraestructura con 4 agentes en paralelo.

**Agent Team "infra-team":**
- `docker-dev` → Dockerfile, docker-compose
- `k8s-dev` → Kubernetes manifests
- `terraform-dev` → AWS infrastructure
- `cicd-dev` → GitHub Actions workflows

**Output:**
```
Dockerfile
docker-compose.yml
docker-compose.test.yml

k8s/
├── namespace.yaml
├── deployment.yaml
├── service.yaml
├── hpa.yaml
└── ...

terraform/
├── main.tf
├── eks.tf
├── rds.tf
└── ...

.github/workflows/
├── ci.yml
├── cd-staging.yml
└── cd-production.yml
```

**Uso:**
```
> /infra
```

---

### `/fraud`

**Propósito:** Implementar feature de fraud detection de forma incremental.

**Agent Team "fraud-team":**
- Wave 1: Domain (FraudDetectionService, FraudAlert entity)
- Wave 2: Application (Use cases para alertas)
- Wave 3: Infrastructure (Prisma migration, repository)
- Wave 4: Presentation (FraudController, endpoints)

**Endpoints generados:**
```
GET  /api/v1/fraud/alerts
GET  /api/v1/fraud/alerts/:userId
PUT  /api/v1/fraud/alerts/:id/resolve
```

**Uso:**
```
> /fraud
```

---

### `/review`

**Propósito:** Code review completo antes de hacer commit.

**Verificaciones:**
1. **Architecture Compliance** - No violaciones de capas
2. **Security** - Validación, no SQL raw, no datos sensibles en logs
3. **Code Quality** - JSDoc, naming, error handling
4. **Testing** - Coverage >= 85%
5. **Linting** - ESLint y TypeScript sin errores

**Output:**
```
docs/reviews/review-{timestamp}.md
```

**Uso:**
```
> /review
```

---

### `/commit`

**Propósito:** Genera commit message semántico basado en los cambios staged.

**Formato generado:**
```
type(scope): description

- Bullet point details
- What was changed

AI-Driven: {agent}, {context}
```

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `infra`

**Scopes:** `domain`, `application`, `infrastructure`, `presentation`, `api`, `config`

**Uso:**
```
> /commit
```

**Ejemplo de output:**
```
feat(domain): implement Transaction entity with business rules

- Add deposit and withdraw methods
- Implement balance validation
- Create Money value object

AI-Driven: domain-dev agent, Wave 1 parallel execution
```

---

### `/status`

**Propósito:** Ver estado actual del proyecto y próximos pasos.

**Muestra:**
- Progreso por fase (Research, Design, Implementation, etc.)
- Archivos implementados por capa
- Coverage actual
- Qué falta por hacer

**Output ejemplo:**
```
# 📊 Project Status

## Phase Progress
- [x] Research (4/4 docs)
- [x] Design (3/3 specs)
- [ ] Implementation (12/20 files)
- [ ] Testing (5/15 tests)

## Coverage
- Domain: 95%
- Overall: 72%

## Next Steps
1. Complete api-dev tasks
2. Run /test
3. Run /review before commit
```

**Uso:**
```
> /status
```

---

### `/docs`

**Propósito:** Generar documentación completa del proyecto.

**Genera:**
- `docs/AI_DRIVEN_PROCESS.md` - Metodología y métricas
- `docs/ARCHITECTURE.md` - Diagramas y explicación
- `docs/API.md` - Documentación de endpoints
- Actualiza `README.md`

**Uso:**
```
> /docs
```

---

## 💡 Tips de Uso

### Combinar con contexto adicional

```
> /implement only wave 1 for now
> /test focus on e2e tests
> /review check security issues only
```

### Ver qué hace un comando antes de ejecutar

```
> show me what /implement does without executing
```

### Ejecutar después de un error

```
> /implement
[error occurs]
> continue from where you left off
```

### Verificar progreso durante ejecución paralela

```
> /implement
[while running]
> show task list status
```

---

## 🔧 Ubicación de los Commands

Los archivos de comandos están en:

```
.claude/commands/
├── bootstrap.md
├── commit.md
├── design.md
├── docs.md
├── fraud.md
├── implement.md
├── infra.md
├── research.md
├── review.md
├── status.md
└── test.md
```

Puedes modificarlos o crear nuevos según tus necesidades.

---

## 📝 Crear un Comando Personalizado

```markdown
---
description: Mi comando personalizado
---

Tu prompt aquí...
Puede ser multi-línea
Con instrucciones detalladas
```

Guárdalo en `.claude/commands/mi-comando.md` y úsalo con `/mi-comando`.
