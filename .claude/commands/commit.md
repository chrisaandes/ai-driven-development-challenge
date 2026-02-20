---
description: Genera commit message semántico con contexto AI
---

Analyze the current staged changes (git diff --staged) and generate a semantic commit message.

**Format:**
```
type(scope): description

- Bullet point details
- What was changed and why

AI-Driven: {agent}, {context}
```

**Types:**
- feat: New feature
- fix: Bug fix
- docs: Documentation
- test: Tests
- refactor: Code refactoring
- chore: Maintenance
- infra: Infrastructure

**Scopes:**
- domain: Domain layer
- application: Application layer
- infrastructure: Infrastructure layer
- presentation: Presentation layer
- api: API changes
- config: Configuration

**Examples:**
```
feat(domain): implement Transaction entity with business rules

- Add deposit and withdraw methods
- Implement balance validation
- Create Money value object

AI-Driven: domain-dev agent, Wave 1 parallel execution
```

```
test(application): add ProcessTransaction use case tests

- Unit tests with mocked repositories
- Edge cases for insufficient balance
- Coverage: 95%

AI-Driven: tester agent, parallel testing phase
```

Generate the commit message based on actual changes.
