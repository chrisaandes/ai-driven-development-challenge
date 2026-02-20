---
description: Usa el architect agent para crear diseño técnico completo
---

Read all research outputs in docs/research/ and the requirements in .claude/specs/01-core-transactions/requirements.md

Use the architect subagent to create comprehensive technical design:

**1. Domain Model Design**
- Entity definitions with behaviors
- Value Objects for type safety
- Repository interfaces (ports)
- Domain events

Output to: .claude/specs/01-core-transactions/design.md

**2. Database Schema**
- Prisma schema with all models
- Indexes for query patterns
- Constraints for data integrity

Output to: .claude/specs/01-core-transactions/database-schema.prisma

**3. API Contract**
- OpenAPI-style endpoint specs
- Request/Response DTOs
- Error response formats

Output to: .claude/specs/01-core-transactions/api-contract.md

**4. Architecture Decision Records**
Create ADRs in docs/architecture/decisions/ for:
- Clean Architecture layers
- Prisma ORM selection
- Error handling strategy
- Transaction atomicity

Ensure designs follow Clean Architecture principles from steering documents.
