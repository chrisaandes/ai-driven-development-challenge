# 🤖 Refácil Wallet - AI-Driven Development Guide

Guía completa para construir un microservicio de billetera digital usando **AI-Driven Development** con **Claude Code**.

## 📁 Contenido de Esta Guía

```
refacil-wallet-guide/
├── GUIA_COMPLETA.md          # Guía paso a paso completa
├── PROMPTS.md                # Colección de prompts por fase
├── scripts/
│   └── setup.sh              # Script de setup automático
└── claude-config/            # Archivos para copiar al proyecto
    ├── CLAUDE.md             # Memory file principal
    ├── steering/             # Documentos de contexto
    │   ├── product.md
    │   ├── tech.md
    │   └── architecture.md
    ├── agents/               # Subagents especializados
    │   ├── architect.md
    │   ├── implementer.md
    │   ├── domain-dev.md
    │   ├── application-dev.md
    │   ├── infrastructure-dev.md
    │   ├── api-dev.md
    │   ├── tester.md
    │   └── reviewer.md
    └── specs/                # Especificaciones por feature
        ├── 01-core-transactions/
        │   └── requirements.md
        ├── 02-fraud-detection/
        │   └── requirements.md
        └── 03-infrastructure/
            └── requirements.md
```

## 🚀 Quick Start

### Opción 1: Setup Automático

```bash
# Descargar y ejecutar el script
chmod +x scripts/setup.sh
./scripts/setup.sh refacil-wallet

# Copiar archivos de configuración
cp -r claude-config/* refacil-wallet/
mv refacil-wallet/CLAUDE.md refacil-wallet/CLAUDE.md

# Habilitar Agent Teams
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Iniciar Claude Code
cd refacil-wallet && claude
```

### Opción 2: Setup Manual

```bash
# 1. Crear proyecto
mkdir refacil-wallet && cd refacil-wallet
git init

# 2. Crear estructura
mkdir -p .claude/{steering,specs,agents,commands}
mkdir -p docs/research
mkdir -p src/{domain,application,infrastructure,presentation}

# 3. Copiar archivos de esta guía
cp <path-to-guide>/claude-config/CLAUDE.md ./CLAUDE.md
cp <path-to-guide>/claude-config/steering/* ./.claude/steering/
cp <path-to-guide>/claude-config/agents/* ./.claude/agents/
cp -r <path-to-guide>/claude-config/specs/* ./.claude/specs/

# 4. Habilitar Agent Teams
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# 5. Iniciar
claude
```

## 📋 Fases del Desarrollo

| Fase | Duración | Agentes | Descripción |
|------|----------|---------|-------------|
| 1. Research | 30 min | 4 paralelos | Investigación de best practices |
| 2. Diseño | 45 min | 1 (architect) | Diseño técnico completo |
| 3. Implementación | 2 horas | 4 paralelos | Código por capas |
| 4. Testing | 1 hora | 3 paralelos | Unit, integration, e2e |
| 5. Infraestructura | 1 hora | 4 paralelos | Docker, K8s, Terraform, CI/CD |
| 6. Fraud Detection | 45 min | 4 paralelos | Feature incremental |
| 7. Documentación | 30 min | 1 | README y docs finales |

**Total estimado: 6-8 horas**

## 🎯 Lo Que Demostrarás

1. **Metodología AI-Driven**
   - Spec-Driven Development
   - Agent orchestration
   - Parallel execution

2. **Clean Architecture**
   - Domain-Driven Design
   - Dependency inversion
   - Separation of concerns

3. **Buenas Prácticas**
   - TDD approach
   - Comprehensive testing
   - Documentation as code

4. **DevOps Moderno**
   - Infrastructure as Code
   - CI/CD pipelines
   - Container orchestration

## 📖 Documentación Incluida

- **GUIA_COMPLETA.md**: Instrucciones detalladas fase por fase
- **PROMPTS.md**: Todos los prompts optimizados listos para copiar

## ⚡ Tips Clave

1. **Siempre habilita Agent Teams** antes de iniciar:
   ```bash
   export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
   ```

2. **Lee los steering docs** al inicio de cada sesión

3. **Documenta el proceso** en `docs/AI_DRIVEN_PROCESS.md`

4. **Commits semánticos** con referencia al agente AI:
   ```
   feat(domain): implement Transaction entity
   
   AI-Driven: domain-dev agent, Wave 1 parallel execution
   ```

5. **Guarda métricas** de tiempo por fase para el README final

## 📊 Métricas Esperadas

| Métrica | Objetivo |
|---------|----------|
| Cobertura de tests | >85% |
| Tiempo total | 6-8 horas |
| Speedup vs secuencial | 2.5-3x |
| Sesiones de agentes | 15-20 |

## 🔗 Recursos Adicionales

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Agent Teams Guide](https://docs.anthropic.com/en/docs/claude-code/agent-teams)
- [Subagents Documentation](https://docs.anthropic.com/en/docs/claude-code/sub-agents)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

---

**¡Buena suerte con la prueba técnica! 🚀**
