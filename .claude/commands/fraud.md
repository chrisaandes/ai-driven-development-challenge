---
description: Implementa feature de fraud detection con agent team
---

Read .claude/specs/02-fraud-detection/requirements.md

Create agent team "fraud-team" to implement fraud detection:

**Wave 1 - Domain:**
domain-dev:
- src/domain/services/fraud-detection.service.ts
  - Velocity check: max N transactions in T minutes
  - Amount threshold detection
  - Configurable via constructor
- src/domain/entities/fraud-alert.entity.ts
- src/domain/events/fraud-detected.event.ts
- src/domain/interfaces/fraud-alert.repository.ts
- Tests for all components

**Wave 2 - Application:**
application-dev:
- Modify ProcessTransactionUseCase to call fraud detection
- src/application/use-cases/list-fraud-alerts.use-case.ts
- src/application/use-cases/get-user-alerts.use-case.ts
- src/application/use-cases/resolve-alert.use-case.ts
- src/application/dtos/fraud-alert.dto.ts
- Tests for all use cases

**Wave 3 - Infrastructure:**
infrastructure-dev:
- Add FraudAlert to prisma/schema.prisma
- Run: npx prisma migrate dev --name add-fraud-alerts
- src/infrastructure/repositories/prisma-fraud-alert.repository.ts
- Tests for repository

**Wave 4 - Presentation:**
api-dev:
- src/presentation/controllers/fraud.controller.ts
  - GET /api/v1/fraud/alerts
  - GET /api/v1/fraud/alerts/:userId
  - PUT /api/v1/fraud/alerts/:id/resolve
- src/presentation/dtos/fraud.dto.ts
- E2E tests

Implement with tests for each component.
