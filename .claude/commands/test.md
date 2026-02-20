---
description: Ejecuta testing paralelo con 3 agentes especializados
---

Read the implementation in src/ to understand the code structure.

Spin up 3 testing subagents in parallel:

**Agent 1 - "unit-tester":**
Create comprehensive unit tests for domain layer.
- All entity methods with edge cases
- Value object validation
- 100% coverage target for src/domain/
- Use Arrange-Act-Assert pattern

Output: src/domain/**/*.spec.ts

**Agent 2 - "integration-tester":**
Create integration tests for use cases.
- Use testcontainers for PostgreSQL
- Test happy paths and error cases
- Verify transaction atomicity
- Test concurrent access

Output: test/integration/*.integration.spec.ts

**Agent 3 - "e2e-tester":**
Create end-to-end API tests.
- All REST endpoints
- Request validation (400)
- Business errors (422)
- Success responses

Output: test/e2e/*.e2e.spec.ts

When complete:
1. Run: npm run test:cov
2. Generate report to docs/testing/coverage-report.md
3. List any gaps found
