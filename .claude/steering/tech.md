# Technical Stack & Standards

## Runtime & Language
- **Node.js**: 20 LTS (Alpine for Docker)
- **TypeScript**: 5.3+ with strict mode
- **Package Manager**: npm

## Framework
- **NestJS**: 10.x
  - Modular architecture
  - Dependency injection
  - Decorators for metadata
  - Built-in validation pipes

## Database
- **PostgreSQL**: 16
- **ORM**: Prisma 5.x
  - Type-safe queries
  - Automatic migrations
  - Connection pooling

## Testing
- **Jest**: Unit and integration tests
- **Supertest**: HTTP assertions for e2e
- **Testcontainers**: Real PostgreSQL for integration tests
- **Coverage**: Istanbul/nyc

## Validation
- **class-validator**: DTO validation decorators
- **class-transformer**: Object transformation

## Documentation
- **Swagger/OpenAPI**: @nestjs/swagger
- **Compodoc**: Code documentation

## Infrastructure
- **Docker**: Multi-stage builds
- **Kubernetes**: Deployment, Service, HPA
- **Terraform**: AWS infrastructure as code
- **GitHub Actions**: CI/CD pipelines

## Code Quality
- **ESLint**: Linting with @typescript-eslint
- **Prettier**: Code formatting
- **Husky**: Git hooks
- **lint-staged**: Pre-commit checks

## Logging & Monitoring
- **Pino**: Structured JSON logging
- **Health checks**: /health endpoint

---

## TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "removeComments": true,
    "skipLibCheck": true
  }
}
```

## ESLint Configuration

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'warn',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
```

## Prisma Schema Conventions

```prisma
// Use snake_case for database, PascalCase for models
model Transaction {
  id            String   @id @default(uuid()) @db.Uuid
  userId        String   @map("user_id") @db.Uuid
  amount        Decimal  @db.Decimal(15, 2)
  type          TransactionType
  balanceAfter  Decimal  @map("balance_after") @db.Decimal(15, 2)
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("transactions")
  @@index([userId, createdAt])
}

enum TransactionType {
  DEPOSIT
  WITHDRAW
}
```

## Environment Variables Pattern

```typescript
// src/config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    url: process.env.DATABASE_URL,
  },
  fraud: {
    velocityWindowMinutes: parseInt(process.env.FRAUD_VELOCITY_WINDOW_MINUTES, 10) || 5,
    velocityMaxTransactions: parseInt(process.env.FRAUD_VELOCITY_MAX_TRANSACTIONS, 10) || 10,
    amountThreshold: parseInt(process.env.FRAUD_AMOUNT_THRESHOLD, 10) || 10000,
  },
});
```

## Error Response Format

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  details?: Record<string, unknown>;
}

// Example
{
  "statusCode": 422,
  "message": "Insufficient balance",
  "error": "Unprocessable Entity",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/v1/transactions",
  "details": {
    "currentBalance": 100.00,
    "requestedAmount": 150.00
  }
}
```

## Success Response Format

```typescript
interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

// Example
{
  "success": true,
  "data": {
    "transactionId": "uuid",
    "type": "DEPOSIT",
    "amount": 100.00,
    "balanceAfter": 200.00,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```
