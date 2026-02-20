---
description: Ejecuta research paralelo con 4 agentes investigando best practices
---

Read CLAUDE.md and all files in .claude/steering/ to understand the project context.

Create 4 research subagents running in parallel:

**Agent 1 - "architecture-researcher":**
Research NestJS + Clean Architecture patterns for financial transaction services.
Focus on: layer separation, dependency injection, error handling, repository pattern.
Output to: docs/research/01-architecture-patterns.md

**Agent 2 - "security-researcher":**
Research security best practices for financial transaction processing.
Focus on: input validation, SQL injection prevention, race conditions, audit logging.
Output to: docs/research/02-security-practices.md

**Agent 3 - "fraud-researcher":**
Research fraud detection algorithms for digital wallets.
Focus on: velocity checks, amount thresholds, pattern recognition, rule engines.
Output to: docs/research/03-fraud-detection.md

**Agent 4 - "devops-researcher":**
Research Kubernetes and Terraform deployment for financial microservices.
Focus on: HPA, health checks, secrets management, zero-downtime deploys.
Output to: docs/research/04-infrastructure.md

Run all 4 in parallel. When complete, synthesize findings into docs/research/00-executive-summary.md
