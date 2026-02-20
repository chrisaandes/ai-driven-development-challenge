---
description: Crea agent team para implementación paralela por capas
---

Read the design specs in .claude/specs/01-core-transactions/

Create an agent team named "wallet-core" to implement in parallel:

**Team Structure:**
- Team Lead (you): Orchestrate, review, integrate
- Teammate "domain-dev": Domain layer
- Teammate "application-dev": Application layer
- Teammate "infrastructure-dev": Infrastructure layer
- Teammate "api-dev": Presentation layer

**Wave 1 (No Dependencies):**
- domain-dev: Entities, Value Objects, Interfaces in src/domain/
- infrastructure-dev: Prisma schema and initial setup

**Wave 2 (After Domain):**
- application-dev: Use cases and DTOs in src/application/
- infrastructure-dev: Repository implementations

**Wave 3 (After Application):**
- api-dev: Controllers, DTOs, Swagger in src/presentation/

**Rules:**
1. Each file MUST have corresponding .spec.ts test
2. All public methods MUST have JSDoc
3. Follow code standards in CLAUDE.md
4. Message team lead when blocked or wave complete

Begin parallel implementation.
