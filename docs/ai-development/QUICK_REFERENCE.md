# 🚀 Quick Reference Card - AI-Driven Development

## Setup Rápido (5 minutos)

```bash
# 1. Crear proyecto
mkdir refacil-wallet && cd refacil-wallet && git init

# 2. Crear estructura
mkdir -p .claude/{steering,specs/01-core-transactions,agents}
mkdir -p docs/research src/{domain,application,infrastructure,presentation}

# 3. Copiar archivos (desde esta guía)
cp claude-config/CLAUDE.md ./CLAUDE.md
cp claude-config/steering/* .claude/steering/
cp claude-config/agents/* .claude/agents/
cp -r claude-config/specs/* .claude/specs/

# 4. Habilitar Agent Teams
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# 5. Iniciar Claude Code
claude
```

---

## Prompts por Fase

### Fase 1: Research (4 agentes, 30 min)
```
Read CLAUDE.md and .claude/steering/. Create 4 research subagents in parallel:
1. architecture-researcher → docs/research/01-architecture.md
2. security-researcher → docs/research/02-security.md
3. fraud-researcher → docs/research/03-fraud.md
4. devops-researcher → docs/research/04-infrastructure.md
Synthesize findings to docs/research/00-summary.md
```

### Fase 2: Diseño (1 agente, 45 min)
```
Use architect subagent to create:
- Domain model → .claude/specs/01-core-transactions/design.md
- Database schema → .claude/specs/01-core-transactions/database-schema.prisma
- API contract → .claude/specs/01-core-transactions/api-contract.md
- ADRs → docs/architecture/decisions/
```

### Fase 3: Implementación (4 agentes, 2 hrs)
```
Create agent team "wallet-core":
- domain-dev: src/domain/ (entities, VOs, interfaces)
- application-dev: src/application/ (use cases, DTOs)
- infrastructure-dev: src/infrastructure/ (Prisma repos)
- api-dev: src/presentation/ (controllers, Swagger)
Execute in waves respecting dependencies.
```

### Fase 4: Testing (3 agentes, 1 hr)
```
Spin up 3 testing agents:
- unit-tester: Domain tests (100% coverage)
- integration-tester: Use case tests with real DB
- e2e-tester: API tests with supertest
```

### Fase 5: Infraestructura (4 agentes, 1 hr)
```
Create agent team "infra-team":
- docker-dev: Dockerfile, docker-compose
- k8s-dev: k8s/ manifests
- terraform-dev: terraform/ AWS infra
- cicd-dev: .github/workflows/
```

---

## Agentes Disponibles

| Agente | Modelo | Propósito |
|--------|--------|-----------|
| architect | opus | Diseño y decisiones |
| domain-dev | sonnet | Capa domain |
| application-dev | sonnet | Capa application |
| infrastructure-dev | sonnet | Capa infrastructure |
| api-dev | sonnet | Capa presentation |
| tester | sonnet | Tests comprehensivos |
| reviewer | opus | Code review |

---

## Commits Semánticos

```
feat(domain): implement Transaction entity

- Add deposit and withdraw methods
- Implement balance validation

AI-Driven: domain-dev agent, Wave 1
```

Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `infra`

---

## Checklist Final

```
□ docs/research/ completo
□ .claude/specs/01-core-transactions/design.md
□ src/ implementado y compilando
□ Tests > 85% coverage
□ Docker build funciona
□ README.md con respuestas conceptuales
□ docs/AI_DRIVEN_PROCESS.md documenta metodología
```

---

## Métricas a Documentar

| Fase | Tiempo | Agentes |
|------|--------|---------|
| Research | __ min | 4 |
| Diseño | __ min | 1 |
| Implementación | __ min | 4 |
| Testing | __ min | 3 |
| Infraestructura | __ min | 4 |
| **Total** | __ hrs | - |
