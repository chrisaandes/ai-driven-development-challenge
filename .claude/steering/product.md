# Product: Refácil Digital Wallet

## Vision
Microservicio de procesamiento de transacciones para un ecosistema de billetera digital.
El sistema permite cargar y restar saldo de manera segura, con detección de fraude integrada.

## Business Context
- **Domain**: Fintech / Digital Payments
- **Users**: Usuarios de billetera digital
- **Scale**: Designed for high-throughput transaction processing

## Core Features

### 1. Transaction Processing
- **Deposit**: Cargar saldo a la billetera
- **Withdraw**: Restar saldo de la billetera
- **Validation**: Montos positivos, saldo suficiente
- **Atomicity**: Operaciones atómicas para consistencia

### 2. Balance Management
- Consulta de saldo actual por usuario
- Historial de transacciones por usuario
- Balance calculado a partir de transacciones

### 3. Fraud Detection (Extra)
- Detección de transacciones consecutivas de alto monto
- Velocity checks (muchas transacciones en poco tiempo)
- Sistema de alertas para comportamiento sospechoso

## User Stories

### US-001: Process Deposit
```
AS A wallet user
I WANT TO deposit money into my wallet
SO THAT I can increase my available balance

ACCEPTANCE CRITERIA:
- Amount must be positive
- Transaction is recorded with unique ID and timestamp
- Wallet balance is updated atomically
- Response includes new balance
```

### US-002: Process Withdrawal
```
AS A wallet user
I WANT TO withdraw money from my wallet
SO THAT I can use my funds

ACCEPTANCE CRITERIA:
- Amount must be positive
- Amount must not exceed current balance
- Transaction is recorded
- Wallet balance is updated atomically
- Returns error if insufficient funds
```

### US-003: Get Transaction History
```
AS A wallet user
I WANT TO see my transaction history
SO THAT I can track my financial activity

ACCEPTANCE CRITERIA:
- Returns list of transactions for user
- Ordered by timestamp descending
- Includes: id, type, amount, timestamp, balance after
```

### US-004: Get Current Balance
```
AS A wallet user
I WANT TO see my current balance
SO THAT I know my available funds

ACCEPTANCE CRITERIA:
- Returns current balance for user
- Balance is accurate (sum of all transactions)
```

### US-005: Fraud Detection (Extra)
```
AS A system operator
I WANT TO detect suspicious transaction patterns
SO THAT I can prevent fraudulent activity

ACCEPTANCE CRITERIA:
- Flag transactions exceeding threshold amount
- Detect rapid consecutive transactions
- Generate alerts for suspicious patterns
- Allow resolution of alerts
```

## Non-Functional Requirements

### Performance
- Transaction processing: < 200ms p99
- Balance query: < 50ms p99
- Support for 1000 TPS peak load

### Reliability
- 99.9% availability target
- Zero data loss for transactions
- Idempotent transaction processing

### Security
- Input validation on all endpoints
- SQL injection prevention
- Audit logging for all operations
- No sensitive data in logs

### Scalability
- Horizontal scaling via Kubernetes
- Database connection pooling
- Stateless application design

## Out of Scope (for this assessment)
- User authentication/authorization
- Multi-currency support
- External payment gateway integration
- Real-time notifications
- Admin dashboard
