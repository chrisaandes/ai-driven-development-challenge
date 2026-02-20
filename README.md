# 💳 Refácil Wallet

Microservicio de billetera digital para procesamiento de transacciones financieras.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-red)](https://nestjs.com/)
[![Tests](https://img.shields.io/badge/tests-274%20passing-brightgreen)]()
[![Prisma](https://img.shields.io/badge/Prisma-7.4-2D3748)](https://www.prisma.io/)

---

## 🤖 AI-Driven Development

Este proyecto fue construido utilizando **AI-Driven Development** con Claude Code, demostrando:

- **Spec-Driven Development**: Especificaciones completas antes de implementar
- **Parallel Agent Execution**: Múltiples agentes trabajando simultáneamente
- **Clean Architecture**: Separación estricta de capas con dependency inversion

📖 [Ver documentación completa del proceso AI](./docs/AI_DRIVEN_PROCESS.md)

### Metricas del Desarrollo

| Metrica | Valor |
|---------|-------|
| Lineas de codigo fuente | 4,368 |
| Lineas de tests | 3,482 |
| Tests unitarios | 274 (21 suites) |
| Sesiones de agentes | 12 (3 teams) |
| Archivos generados | 90 TypeScript |
| Commits | 10 |

---

## 🚀 Quick Start

### Prerrequisitos

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (o usar Docker)

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/chrisaandes/ai-driven-development-challenge.git
cd refacil-wallet

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env

# Iniciar base de datos
docker-compose up -d db

# Ejecutar migraciones
npm run prisma:migrate

# Iniciar en desarrollo
npm run start:dev
```

### Con Docker (recomendado)

```bash
docker-compose up -d
```

La API estará disponible en `http://localhost:3000`

Swagger UI: `http://localhost:3000/api/docs`

---

## 📚 API Reference

### Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/v1/transactions` | Procesar transacción (depósito/retiro) |
| `GET` | `/api/v1/transactions?user_id={id}` | Obtener historial de transacciones |
| `GET` | `/api/v1/wallets/{userId}/balance` | Consultar saldo actual |
| `GET` | `/api/v1/fraud/alerts` | Listar alertas de fraude |
| `GET` | `/api/v1/fraud/alerts/{userId}` | Alertas por usuario |
| `PUT` | `/api/v1/fraud/alerts/{id}/resolve` | Resolver alerta |
| `GET` | `/health` | Liveness probe |
| `GET` | `/health/ready` | Readiness probe |

### Ejemplo: Procesar Depósito

```bash
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "amount": 100.50,
    "type": "deposit",
    "timestamp": "2024-01-15T10:30:00Z"
  }'
```

**Respuesta:**
```json
{
  "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "deposit",
  "amount": 100.50,
  "balance_after": 100.50,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

📖 [Documentación completa de API](./docs/API.md)

---

## 🏗️ Arquitectura

El proyecto implementa **Clean Architecture** con cuatro capas:

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION                             │
│            Controllers, DTOs, Filters, Swagger               │
├─────────────────────────────────────────────────────────────┤
│                     APPLICATION                              │
│              Use Cases, Application DTOs                     │
├─────────────────────────────────────────────────────────────┤
│                       DOMAIN                                 │
│     Entities, Value Objects, Repository Interfaces           │
├─────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE                            │
│          Prisma Repositories, Database, External APIs        │
└─────────────────────────────────────────────────────────────┘
```

**Regla de Dependencia**: Las dependencias solo apuntan hacia adentro. Domain no tiene dependencias externas.

📖 [Documentación de arquitectura](./docs/ARCHITECTURE.md)

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# Tests con coverage
npm run test:cov

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

### Tests por Capa

| Capa | Tests | Suites |
|------|-------|--------|
| Domain | 145 | 6 |
| Application | 35 | 7 |
| Infrastructure | 29 | 3 |
| Presentation | 64 | 4 |
| **Total** | **274** | **21** |

---

## 🐳 Deployment

### Docker

```bash
# Build imagen
docker build -t refacil-wallet:latest .

# Run
docker run -p 3000:3000 --env-file .env refacil-wallet:latest
```

### Kubernetes

```bash
# Aplicar manifiestos
kubectl apply -f k8s/

# Verificar
kubectl get pods -n refacil-wallet
```

### Terraform (AWS)

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

---

## 💡 Respuestas Conceptuales

### 1. ¿Cómo manejarías picos altos de transacciones para garantizar escalabilidad?

**Estrategia multi-nivel implementada:**

**Horizontal Scaling (Kubernetes)**
- HPA configurado para escalar de 2 a 10 pods basado en CPU (70%) y memoria (80%)
- Pod Disruption Budget garantiza disponibilidad durante scaling
- Anti-affinity rules distribuyen pods entre nodos

**Database Optimization**
- Connection pooling con PgBouncer para manejar más conexiones concurrentes
- Read replicas para queries de lectura (balance, historial)
- Indexes optimizados para los patrones de query más frecuentes
- Particionamiento de tabla transactions por fecha para queries históricos

**Async Processing**
- Detección de fraude ejecuta de forma asíncrona post-transacción
- Event-driven architecture permite desacoplar operaciones no críticas
- Queue (SQS/RabbitMQ) para operaciones que pueden tolerar latencia

**Caching Strategy**
- Redis para cachear balances con invalidación en cada transacción
- Cache de configuración de fraude (thresholds, rules)

**Código de ejemplo (HPA):**
```yaml
spec:
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          averageUtilization: 70
```

---

### 2. ¿Qué estrategias usarías para prevenir fraudes en un sistema de billetera digital?

**Implementación actual (Rule-Based):**

1. **Velocity Checks**: Detecta múltiples transacciones en ventana de tiempo
   - Default: Max 10 transacciones en 5 minutos
   - Configurable por ambiente

2. **Amount Thresholds**: Alerta para montos inusualmente altos
   - Default: > $10,000 genera alerta
   - Severidad escalonada (LOW/MEDIUM/HIGH)

3. **Sistema de Alertas**: Persistencia y gestión de alertas para revisión manual

**Estrategias adicionales recomendadas:**

**Machine Learning (Fase 2)**
- Anomaly detection para patrones de comportamiento por usuario
- Modelo de scoring de riesgo en tiempo real
- Features: hora del día, dispositivo, ubicación, monto relativo al histórico

**Device Fingerprinting**
- Identificar dispositivos únicos
- Detectar múltiples cuentas desde mismo dispositivo
- Flag cambios de dispositivo inusuales

**Geolocation Analysis**
- Impossible travel detection (transacción en CDMX, 5 min después en NYC)
- Geofencing para mercados específicos
- VPN/Proxy detection

**Behavioral Biometrics**
- Patrones de typing
- Patrones de navegación en app
- Tiempo típico entre acciones

**Network Analysis**
- Grafos de relaciones entre cuentas
- Detectar rings de fraude
- Money mule detection

---

### 3. Si detectas lentitud en el procesamiento por alta concurrencia, ¿cómo procederías?

**Proceso de diagnóstico:**

**1. Observabilidad (primeras horas)**
```bash
# Identificar cuellos de botella
- APM (DataDog/NewRelic): Trace de requests lentos
- Database: pg_stat_statements para queries lentos
- Logs: Correlacionar errores con latencia
```

**2. Análisis de Base de Datos**
```sql
-- Queries más lentos
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;

-- Locks activos
SELECT * FROM pg_locks WHERE NOT granted;

-- Conexiones por estado
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
```

**3. Soluciones por causa raíz:**

| Causa | Solución |
|-------|----------|
| Lock contention | Optimistic locking con version field |
| Queries lentos | Agregar índices, EXPLAIN ANALYZE |
| Pool agotado | Aumentar pool, agregar PgBouncer |
| CPU saturado | Scale horizontal (más pods) |
| Memoria | Optimizar queries, reducir payload |

**4. Implementación de Optimistic Locking:**
```typescript
// En lugar de SELECT FOR UPDATE (pesimista)
async withdraw(walletId: string, amount: Money): Promise<Result> {
  const wallet = await this.findById(walletId);
  
  // Intento con version check
  const updated = await this.prisma.wallet.updateMany({
    where: { 
      id: walletId, 
      version: wallet.version  // Optimistic lock
    },
    data: { 
      balance: { decrement: amount.value },
      version: { increment: 1 }
    }
  });
  
  if (updated.count === 0) {
    // Retry o error de concurrencia
    throw new ConcurrencyException();
  }
}
```

**5. Circuit Breaker para degradación graceful:**
```typescript
@CircuitBreaker({ timeout: 3000, errorThreshold: 50 })
async processTransaction(input: ProcessTransactionInput) {
  // Si el servicio está sobrecargado, fail fast
}
```

---

## 📁 Estructura del Proyecto

```
refacil-wallet/
├── src/
│   ├── domain/           # Entidades, Value Objects, Interfaces
│   ├── application/      # Use Cases, DTOs
│   ├── infrastructure/   # Prisma, Repositories
│   └── presentation/     # Controllers, Filters
├── test/
│   ├── integration/      # Tests con DB real
│   └── e2e/              # Tests de API
├── prisma/               # Schema y migraciones
├── k8s/                  # Kubernetes manifests
├── terraform/            # Infrastructure as Code
├── docs/
│   ├── ai-development/   # Documentación del proceso AI
│   ├── architecture/     # ADRs y diagramas
│   └── testing/          # Reportes de coverage
└── .claude/              # Configuración Claude Code
    ├── steering/         # Contexto del proyecto
    ├── agents/           # Subagents especializados
    └── specs/            # Especificaciones por feature
```

---

## 🛠️ Scripts Disponibles

```bash
npm run start:dev      # Desarrollo con hot reload
npm run build          # Build para producción
npm run test           # Unit tests
npm run test:cov       # Tests con coverage
npm run test:e2e       # End-to-end tests
npm run lint           # ESLint
npm run format         # Prettier
npm run prisma:generate # Generar cliente Prisma
npm run prisma:migrate  # Ejecutar migraciones
npm run prisma:studio   # UI para base de datos
```

---

## 🔧 Variables de Entorno

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/wallet

# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Fraud Detection
FRAUD_AMOUNT_THRESHOLD=10000
FRAUD_VELOCITY_WINDOW_MINUTES=5
FRAUD_VELOCITY_MAX_TRANSACTIONS=10
```

---

## 📄 Licencia

MIT License - ver [LICENSE](./LICENSE)

---

## 👨‍💻 Autor

Desarrollado con 🤖 AI-Driven Development usando [Claude Code](https://claude.ai)

---

<p align="center">
  <sub>Built with ❤️ and AI</sub>
</p>
