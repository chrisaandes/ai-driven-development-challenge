# API Contract: Refacil Wallet Microservice

**Version**: 1.0.0
**Date**: 2026-02-20
**Author**: architect agent
**Phase**: 2 - Design
**Status**: APPROVED

---

## Table of Contents

1. [API Overview](#1-api-overview)
2. [Endpoint Specifications](#2-endpoint-specifications)
   - 2.1 [POST /api/v1/transactions - Process Transaction](#21-post-apiv1transactions---process-transaction)
   - 2.2 [GET /api/v1/transactions - Get Transaction History](#22-get-apiv1transactions---get-transaction-history)
   - 2.3 [GET /api/v1/wallets/:userId/balance - Get Balance](#23-get-apiv1walletsuseridbalance---get-balance)
   - 2.4 [GET /api/v1/fraud/alerts - List Fraud Alerts](#24-get-apiv1fraudalerts---list-fraud-alerts)
   - 2.5 [GET /api/v1/fraud/alerts/:userId - Get Alerts by User](#25-get-apiv1fraudalertsuserid---get-alerts-by-user)
   - 2.6 [PUT /api/v1/fraud/alerts/:id/resolve - Resolve Alert](#26-put-apiv1fraudalertsidresolve---resolve-alert)
   - 2.7 [GET /health - Health Check (Liveness)](#27-get-health---health-check-liveness)
   - 2.8 [GET /health/ready - Readiness Check](#28-get-healthready---readiness-check)
3. [Common Response Formats](#3-common-response-formats)
4. [Error Code Reference Table](#4-error-code-reference-table)
5. [Validation Rules Summary Table](#5-validation-rules-summary-table)
6. [Request/Response DTO TypeScript Definitions](#6-requestresponse-dto-typescript-definitions)
7. [Idempotency Behavior](#7-idempotency-behavior)

---

## 1. API Overview

### Base URL

```
/api/v1
```

All API endpoints are prefixed with `/api/v1`, except for health check endpoints which are served at the root level (`/health`, `/health/ready`).

### Content Type

All requests and responses use JSON:

```
Content-Type: application/json
Accept: application/json
```

### Common Request Headers

| Header | Required | Description | Example |
|--------|----------|-------------|---------|
| `Content-Type` | Yes (for POST/PUT) | Must be `application/json` | `application/json` |
| `Accept` | No | Preferred response format | `application/json` |
| `X-Correlation-Id` | No | Client-provided correlation ID for distributed tracing. If not provided, the server generates a UUID v4 and includes it in the response. | `550e8400-e29b-41d4-a716-446655440099` |

### Common Response Headers

| Header | Always Present | Description |
|--------|---------------|-------------|
| `Content-Type` | Yes | `application/json` |
| `X-Correlation-Id` | Yes | The correlation ID for this request (echoed from request or server-generated) |
| `Cache-Control` | Yes | `no-store, no-cache, must-revalidate` (financial data must not be cached) |
| `Pragma` | Yes | `no-cache` |
| `Expires` | Yes | `0` |
| `Strict-Transport-Security` | Yes | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | Yes | `nosniff` |
| `X-Frame-Options` | Yes | `DENY` |

### Authentication

Authentication and authorization are **out of scope** for this version of the API. All endpoints are publicly accessible. The architecture is designed so that authentication middleware (e.g., JWT validation) can be added as a NestJS guard without modifying business logic.

### Rate Limiting

Rate limiting is enforced globally using `@nestjs/throttler`. Limits are applied per client IP address.

| Tier | Window | Max Requests | Scope |
|------|--------|-------------|-------|
| Short | 1 second | 10 requests | Per IP |
| Medium | 1 minute | 100 requests | Per IP |

When the rate limit is exceeded, the server responds with HTTP `429 Too Many Requests`:

```json
{
  "statusCode": 429,
  "message": "Too many requests. Please try again later.",
  "error": "Too Many Requests",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/v1/transactions"
}
```

The following rate-limit headers are included in responses:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum number of requests allowed in the window |
| `X-RateLimit-Remaining` | Number of requests remaining in the current window |
| `Retry-After` | Seconds until the rate limit resets (only on 429 responses) |

### Health check endpoints (`/health`, `/health/ready`) are exempt from rate limiting.

---

## 2. Endpoint Specifications

---

### 2.1 POST /api/v1/transactions - Process Transaction

**Description**: Process a financial transaction (deposit or withdrawal) on a user's wallet. The `transaction_id` field serves as an idempotency key to prevent duplicate processing.

**HTTP Method**: `POST`
**Path**: `/api/v1/transactions`

#### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | Must be `application/json` |
| `X-Correlation-Id` | No | Client-provided correlation ID |

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transaction_id` | string | Yes | UUID v4 serving as the idempotency key. Must be unique per logical transaction. |
| `user_id` | string | Yes | UUID v4 identifying the wallet owner. |
| `amount` | number | Yes | Positive number with at most 2 decimal places. Min: 0.01, Max: 999,999,999.99. |
| `type` | string | Yes | Transaction type. Must be one of: `"deposit"`, `"withdraw"`. |
| `timestamp` | string | Yes | ISO 8601 datetime string indicating when the client initiated the transaction. |

#### Request Body DTO

```typescript
import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  Min,
  Max,
  IsIn,
  IsISO8601,
} from 'class-validator';

export class CreateTransactionRequestDto {
  @ApiProperty({
    description: 'Unique transaction ID (UUID v4) used as idempotency key',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'transaction_id must be a valid UUID v4' })
  @IsNotEmpty({ message: 'transaction_id is required' })
  transaction_id: string;

  @ApiProperty({
    description: 'User ID (UUID v4) identifying the wallet owner',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'user_id must be a valid UUID v4' })
  @IsNotEmpty({ message: 'user_id is required' })
  user_id: string;

  @ApiProperty({
    description: 'Transaction amount. Must be positive with at most 2 decimal places.',
    example: 100.50,
    minimum: 0.01,
    maximum: 999999999.99,
  })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @IsPositive({ message: 'amount must be greater than zero' })
  @Min(0.01, { message: 'Minimum transaction amount is 0.01' })
  @Max(999999999.99, { message: 'Maximum transaction amount is 999,999,999.99' })
  amount: number;

  @ApiProperty({
    description: 'Transaction type',
    enum: ['deposit', 'withdraw'],
    example: 'deposit',
  })
  @IsIn(['deposit', 'withdraw'], {
    message: 'type must be either "deposit" or "withdraw"',
  })
  @IsNotEmpty({ message: 'type is required' })
  type: string;

  @ApiProperty({
    description: 'Client-side timestamp in ISO 8601 format',
    example: '2024-01-15T10:30:00Z',
  })
  @IsISO8601({ strict: true }, { message: 'timestamp must be a valid ISO 8601 date string' })
  @IsNotEmpty({ message: 'timestamp is required' })
  timestamp: string;
}
```

#### Success Response (201 Created) - First Request

Returned when the transaction is successfully processed for the first time.

```json
{
  "success": true,
  "data": {
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "deposit",
    "amount": 100.50,
    "balance_after": 100.50,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00.123Z",
    "correlationId": "550e8400-e29b-41d4-a716-446655440099"
  }
}
```

#### Success Response (200 OK) - Duplicate Request (Idempotent)

Returned when the same `transaction_id` is submitted again. Returns the original transaction result. See [Section 7: Idempotency Behavior](#7-idempotency-behavior) for details.

```json
{
  "success": true,
  "data": {
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "deposit",
    "amount": 100.50,
    "balance_after": 100.50,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:05.456Z",
    "correlationId": "550e8400-e29b-41d4-a716-446655440100"
  }
}
```

#### Error Responses

| Status Code | Error | When | Details |
|-------------|-------|------|---------|
| 400 | Bad Request | Validation error: invalid UUID, missing required field, invalid amount format, invalid type, invalid timestamp | Returns array of validation errors per field |
| 409 | Conflict | Duplicate `transaction_id` with different payload fields (misuse of idempotency key) | Only returned if the same `transaction_id` is sent with different `user_id`, `amount`, `type`, or `timestamp` |
| 422 | Unprocessable Entity | Business rule violation: insufficient balance for withdrawal | Includes `currentBalance` and `requestedAmount` in details |
| 429 | Too Many Requests | Rate limit exceeded | Includes `Retry-After` header |
| 500 | Internal Server Error | Unexpected server error | Generic error message, details logged server-side |

#### Example Request (curl)

```bash
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: 550e8400-e29b-41d4-a716-446655440099" \
  -d '{
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "amount": 100.50,
    "type": "deposit",
    "timestamp": "2024-01-15T10:30:00Z"
  }'
```

#### Example Success Response (201 Created - Deposit)

```json
{
  "success": true,
  "data": {
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "deposit",
    "amount": 100.50,
    "balance_after": 100.50,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00.123Z",
    "correlationId": "550e8400-e29b-41d4-a716-446655440099"
  }
}
```

#### Example Success Response (201 Created - Withdrawal)

```json
{
  "success": true,
  "data": {
    "transaction_id": "550e8400-e29b-41d4-a716-446655440002",
    "type": "withdraw",
    "amount": 50.00,
    "balance_after": 50.50,
    "timestamp": "2024-01-15T11:00:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-15T11:00:00.456Z",
    "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

#### Example Error Response (400 - Validation Error)

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/v1/transactions",
  "details": {
    "errors": [
      {
        "field": "amount",
        "constraints": [
          "amount must be greater than zero",
          "amount must be a number with at most 2 decimal places"
        ]
      },
      {
        "field": "user_id",
        "constraints": [
          "user_id must be a valid UUID v4"
        ]
      }
    ]
  }
}
```

#### Example Error Response (422 - Insufficient Balance)

```json
{
  "statusCode": 422,
  "message": "Insufficient balance",
  "error": "Unprocessable Entity",
  "timestamp": "2024-01-15T11:00:00.000Z",
  "path": "/api/v1/transactions",
  "details": {
    "currentBalance": 100.00,
    "requestedAmount": 150.00
  }
}
```

#### Example Error Response (409 - Idempotency Conflict)

```json
{
  "statusCode": 409,
  "message": "A transaction with this ID already exists with different parameters",
  "error": "Conflict",
  "timestamp": "2024-01-15T10:31:00.000Z",
  "path": "/api/v1/transactions",
  "details": {
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### Example Error Response (429 - Rate Limit Exceeded)

```json
{
  "statusCode": 429,
  "message": "Too many requests. Please try again later.",
  "error": "Too Many Requests",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/v1/transactions"
}
```

#### Example Error Response (500 - Internal Server Error)

```json
{
  "statusCode": 500,
  "message": "An internal error occurred. Please try again later.",
  "error": "Internal Server Error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/v1/transactions"
}
```

---

### 2.2 GET /api/v1/transactions - Get Transaction History

**Description**: Retrieve the transaction history for a given user. Transactions are returned in descending order by timestamp (newest first).

**HTTP Method**: `GET`
**Path**: `/api/v1/transactions`

#### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Correlation-Id` | No | Client-provided correlation ID |

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | Yes | UUID v4 identifying the wallet owner whose transaction history is requested. |

#### Query Parameters DTO

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class GetTransactionHistoryQueryDto {
  @ApiProperty({
    description: 'User ID (UUID v4) to retrieve transactions for',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'user_id must be a valid UUID v4' })
  @IsNotEmpty({ message: 'user_id is required' })
  user_id: string;
}
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "transaction_id": "550e8400-e29b-41d4-a716-446655440002",
        "type": "withdraw",
        "amount": 50.00,
        "balance_after": 50.50,
        "timestamp": "2024-01-15T11:00:00.000Z"
      },
      {
        "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
        "type": "deposit",
        "amount": 100.50,
        "balance_after": 100.50,
        "timestamp": "2024-01-15T10:30:00.000Z"
      }
    ],
    "total": 2
  },
  "meta": {
    "timestamp": "2024-01-15T11:05:00.000Z",
    "correlationId": "b2c3d4e5-f6a7-8901-bcde-f12345678901"
  }
}
```

#### Error Responses

| Status Code | Error | When |
|-------------|-------|------|
| 400 | Bad Request | Missing `user_id` query parameter or invalid UUID format |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

#### Example Request (curl)

```bash
curl -X GET "http://localhost:3000/api/v1/transactions?user_id=550e8400-e29b-41d4-a716-446655440001" \
  -H "Accept: application/json" \
  -H "X-Correlation-Id: b2c3d4e5-f6a7-8901-bcde-f12345678901"
```

#### Example Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "transaction_id": "550e8400-e29b-41d4-a716-446655440002",
        "type": "withdraw",
        "amount": 50.00,
        "balance_after": 50.50,
        "timestamp": "2024-01-15T11:00:00.000Z"
      },
      {
        "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
        "type": "deposit",
        "amount": 100.50,
        "balance_after": 100.50,
        "timestamp": "2024-01-15T10:30:00.000Z"
      }
    ],
    "total": 2
  },
  "meta": {
    "timestamp": "2024-01-15T11:05:00.000Z",
    "correlationId": "b2c3d4e5-f6a7-8901-bcde-f12345678901"
  }
}
```

#### Example Success Response (200 OK - No Transactions)

```json
{
  "success": true,
  "data": {
    "transactions": [],
    "total": 0
  },
  "meta": {
    "timestamp": "2024-01-15T11:05:00.000Z",
    "correlationId": "c3d4e5f6-a7b8-9012-cdef-123456789012"
  }
}
```

#### Example Error Response (400 - Missing user_id)

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-15T11:05:00.000Z",
  "path": "/api/v1/transactions",
  "details": {
    "errors": [
      {
        "field": "user_id",
        "constraints": [
          "user_id is required",
          "user_id must be a valid UUID v4"
        ]
      }
    ]
  }
}
```

---

### 2.3 GET /api/v1/wallets/:userId/balance - Get Balance

**Description**: Retrieve the current balance of a user's wallet.

**HTTP Method**: `GET`
**Path**: `/api/v1/wallets/:userId/balance`

#### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Correlation-Id` | No | Client-provided correlation ID |

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | UUID v4 identifying the wallet owner. |

#### Path Parameters DTO

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetBalanceParamsDto {
  @ApiProperty({
    description: 'User ID (UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  userId: string;
}
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "balance": 50.50,
    "last_updated": "2024-01-15T11:00:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-15T11:05:00.000Z",
    "correlationId": "d4e5f6a7-b8c9-0123-defa-234567890123"
  }
}
```

#### Error Responses

| Status Code | Error | When |
|-------------|-------|------|
| 400 | Bad Request | Invalid UUID format for `userId` path parameter |
| 404 | Not Found | No wallet exists for the given `userId` |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

#### Example Request (curl)

```bash
curl -X GET "http://localhost:3000/api/v1/wallets/550e8400-e29b-41d4-a716-446655440001/balance" \
  -H "Accept: application/json" \
  -H "X-Correlation-Id: d4e5f6a7-b8c9-0123-defa-234567890123"
```

#### Example Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "balance": 50.50,
    "last_updated": "2024-01-15T11:00:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-15T11:05:00.000Z",
    "correlationId": "d4e5f6a7-b8c9-0123-defa-234567890123"
  }
}
```

#### Example Error Response (400 - Invalid UUID)

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-15T11:05:00.000Z",
  "path": "/api/v1/wallets/not-a-uuid/balance",
  "details": {
    "errors": [
      {
        "field": "userId",
        "constraints": [
          "userId must be a valid UUID v4"
        ]
      }
    ]
  }
}
```

#### Example Error Response (404 - Wallet Not Found)

```json
{
  "statusCode": 404,
  "message": "Wallet not found for user 550e8400-e29b-41d4-a716-446655440099",
  "error": "Not Found",
  "timestamp": "2024-01-15T11:05:00.000Z",
  "path": "/api/v1/wallets/550e8400-e29b-41d4-a716-446655440099/balance"
}
```

---

### 2.4 GET /api/v1/fraud/alerts - List Fraud Alerts

**Description**: Retrieve all fraud alerts in the system. Optionally filter by resolution status. Alerts are returned in descending order by creation time (newest first).

**HTTP Method**: `GET`
**Path**: `/api/v1/fraud/alerts`

#### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Correlation-Id` | No | Client-provided correlation ID |

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resolved` | string | No | Filter by resolution status. Must be `"true"` or `"false"`. When omitted, returns all alerts regardless of resolution status. |

#### Query Parameters DTO

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsIn } from 'class-validator';

export class ListFraudAlertsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by resolution status',
    enum: ['true', 'false'],
    example: 'false',
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'resolved must be "true" or "false"' })
  resolved?: string;
}
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440010",
        "transaction_id": "550e8400-e29b-41d4-a716-446655440005",
        "user_id": "550e8400-e29b-41d4-a716-446655440001",
        "alert_type": "HIGH_AMOUNT",
        "severity": "MEDIUM",
        "details": {
          "amount": 25000,
          "threshold": 10000
        },
        "resolved": false,
        "resolved_at": null,
        "resolution_notes": null,
        "created_at": "2024-01-15T10:30:00.000Z"
      }
    ],
    "total": 1
  },
  "meta": {
    "timestamp": "2024-01-15T12:00:00.000Z",
    "correlationId": "e5f6a7b8-c9d0-1234-efab-345678901234"
  }
}
```

#### Error Responses

| Status Code | Error | When |
|-------------|-------|------|
| 400 | Bad Request | Invalid `resolved` query parameter value (not `"true"` or `"false"`) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

#### Example Request (curl)

```bash
# List all unresolved alerts
curl -X GET "http://localhost:3000/api/v1/fraud/alerts?resolved=false" \
  -H "Accept: application/json" \
  -H "X-Correlation-Id: e5f6a7b8-c9d0-1234-efab-345678901234"
```

```bash
# List all alerts (no filter)
curl -X GET "http://localhost:3000/api/v1/fraud/alerts" \
  -H "Accept: application/json"
```

#### Example Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440010",
        "transaction_id": "550e8400-e29b-41d4-a716-446655440005",
        "user_id": "550e8400-e29b-41d4-a716-446655440001",
        "alert_type": "HIGH_AMOUNT",
        "severity": "MEDIUM",
        "details": {
          "amount": 25000,
          "threshold": 10000
        },
        "resolved": false,
        "resolved_at": null,
        "resolution_notes": null,
        "created_at": "2024-01-15T10:30:00.000Z"
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440011",
        "transaction_id": "550e8400-e29b-41d4-a716-446655440006",
        "user_id": "550e8400-e29b-41d4-a716-446655440002",
        "alert_type": "VELOCITY_EXCEEDED",
        "severity": "HIGH",
        "details": {
          "transactionCount": 25,
          "maxAllowed": 10,
          "windowMinutes": 5
        },
        "resolved": false,
        "resolved_at": null,
        "resolution_notes": null,
        "created_at": "2024-01-15T10:25:00.000Z"
      }
    ],
    "total": 2
  },
  "meta": {
    "timestamp": "2024-01-15T12:00:00.000Z",
    "correlationId": "e5f6a7b8-c9d0-1234-efab-345678901234"
  }
}
```

#### Example Success Response (200 OK - No Alerts)

```json
{
  "success": true,
  "data": {
    "alerts": [],
    "total": 0
  },
  "meta": {
    "timestamp": "2024-01-15T12:00:00.000Z",
    "correlationId": "f6a7b8c9-d0e1-2345-fabc-456789012345"
  }
}
```

#### Example Error Response (400 - Invalid resolved Parameter)

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "path": "/api/v1/fraud/alerts",
  "details": {
    "errors": [
      {
        "field": "resolved",
        "constraints": [
          "resolved must be \"true\" or \"false\""
        ]
      }
    ]
  }
}
```

---

### 2.5 GET /api/v1/fraud/alerts/:userId - Get Alerts by User

**Description**: Retrieve all fraud alerts associated with a specific user. Alerts are returned in descending order by creation time (newest first).

**HTTP Method**: `GET`
**Path**: `/api/v1/fraud/alerts/:userId`

#### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Correlation-Id` | No | Client-provided correlation ID |

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | UUID v4 identifying the user whose alerts are requested. |

#### Path Parameters DTO

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetAlertsByUserParamsDto {
  @ApiProperty({
    description: 'User ID (UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  userId: string;
}
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440010",
        "transaction_id": "550e8400-e29b-41d4-a716-446655440005",
        "user_id": "550e8400-e29b-41d4-a716-446655440001",
        "alert_type": "HIGH_AMOUNT",
        "severity": "MEDIUM",
        "details": {
          "amount": 25000,
          "threshold": 10000
        },
        "resolved": false,
        "resolved_at": null,
        "resolution_notes": null,
        "created_at": "2024-01-15T10:30:00.000Z"
      }
    ],
    "total": 1
  },
  "meta": {
    "timestamp": "2024-01-15T12:00:00.000Z",
    "correlationId": "a7b8c9d0-e1f2-3456-abcd-567890123456"
  }
}
```

#### Error Responses

| Status Code | Error | When |
|-------------|-------|------|
| 400 | Bad Request | Invalid UUID format for `userId` path parameter |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

#### Example Request (curl)

```bash
curl -X GET "http://localhost:3000/api/v1/fraud/alerts/550e8400-e29b-41d4-a716-446655440001" \
  -H "Accept: application/json" \
  -H "X-Correlation-Id: a7b8c9d0-e1f2-3456-abcd-567890123456"
```

#### Example Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440010",
        "transaction_id": "550e8400-e29b-41d4-a716-446655440005",
        "user_id": "550e8400-e29b-41d4-a716-446655440001",
        "alert_type": "HIGH_AMOUNT",
        "severity": "MEDIUM",
        "details": {
          "amount": 25000,
          "threshold": 10000
        },
        "resolved": false,
        "resolved_at": null,
        "resolution_notes": null,
        "created_at": "2024-01-15T10:30:00.000Z"
      }
    ],
    "total": 1
  },
  "meta": {
    "timestamp": "2024-01-15T12:00:00.000Z",
    "correlationId": "a7b8c9d0-e1f2-3456-abcd-567890123456"
  }
}
```

#### Example Success Response (200 OK - No Alerts for User)

```json
{
  "success": true,
  "data": {
    "alerts": [],
    "total": 0
  },
  "meta": {
    "timestamp": "2024-01-15T12:00:00.000Z",
    "correlationId": "b8c9d0e1-f2a3-4567-bcde-678901234567"
  }
}
```

#### Example Error Response (400 - Invalid UUID)

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "path": "/api/v1/fraud/alerts/not-a-valid-uuid",
  "details": {
    "errors": [
      {
        "field": "userId",
        "constraints": [
          "userId must be a valid UUID v4"
        ]
      }
    ]
  }
}
```

---

### 2.6 PUT /api/v1/fraud/alerts/:id/resolve - Resolve Alert

**Description**: Mark a fraud alert as resolved. Optionally include resolution notes describing the action taken.

**HTTP Method**: `PUT`
**Path**: `/api/v1/fraud/alerts/:id/resolve`

#### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | Must be `application/json` |
| `X-Correlation-Id` | No | Client-provided correlation ID |

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | UUID v4 identifying the fraud alert to resolve. |

#### Path Parameters DTO

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ResolveAlertParamsDto {
  @ApiProperty({
    description: 'Alert ID (UUID v4)',
    example: '660e8400-e29b-41d4-a716-446655440010',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resolution_notes` | string | No | Free-text notes describing the resolution action. Maximum 500 characters. |

#### Request Body DTO

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveAlertRequestDto {
  @ApiPropertyOptional({
    description: 'Notes describing the resolution action taken',
    example: 'Verified with user, legitimate transaction',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'resolution_notes must be a string' })
  @MaxLength(500, { message: 'resolution_notes cannot exceed 500 characters' })
  resolution_notes?: string;
}
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440010",
    "resolved": true,
    "resolved_at": "2024-01-15T12:00:00.000Z",
    "resolution_notes": "Verified with user, legitimate transaction"
  },
  "meta": {
    "timestamp": "2024-01-15T12:00:00.123Z",
    "correlationId": "c9d0e1f2-a3b4-5678-cdef-789012345678"
  }
}
```

#### Error Responses

| Status Code | Error | When |
|-------------|-------|------|
| 400 | Bad Request | Invalid UUID format for `id` path parameter, or `resolution_notes` exceeds 500 characters |
| 404 | Not Found | No fraud alert exists with the given `id` |
| 422 | Unprocessable Entity | Alert has already been resolved |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

#### Example Request (curl)

```bash
curl -X PUT "http://localhost:3000/api/v1/fraud/alerts/660e8400-e29b-41d4-a716-446655440010/resolve" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: c9d0e1f2-a3b4-5678-cdef-789012345678" \
  -d '{
    "resolution_notes": "Verified with user, legitimate transaction"
  }'
```

```bash
# Resolve without notes
curl -X PUT "http://localhost:3000/api/v1/fraud/alerts/660e8400-e29b-41d4-a716-446655440010/resolve" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Example Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440010",
    "resolved": true,
    "resolved_at": "2024-01-15T12:00:00.000Z",
    "resolution_notes": "Verified with user, legitimate transaction"
  },
  "meta": {
    "timestamp": "2024-01-15T12:00:00.123Z",
    "correlationId": "c9d0e1f2-a3b4-5678-cdef-789012345678"
  }
}
```

#### Example Error Response (404 - Alert Not Found)

```json
{
  "statusCode": 404,
  "message": "Fraud alert not found: 660e8400-e29b-41d4-a716-446655440099",
  "error": "Not Found",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "path": "/api/v1/fraud/alerts/660e8400-e29b-41d4-a716-446655440099/resolve"
}
```

#### Example Error Response (422 - Already Resolved)

```json
{
  "statusCode": 422,
  "message": "Alert has already been resolved",
  "error": "Unprocessable Entity",
  "timestamp": "2024-01-15T12:05:00.000Z",
  "path": "/api/v1/fraud/alerts/660e8400-e29b-41d4-a716-446655440010/resolve",
  "details": {
    "alert_id": "660e8400-e29b-41d4-a716-446655440010",
    "resolved_at": "2024-01-15T12:00:00.000Z"
  }
}
```

---

### 2.7 GET /health - Health Check (Liveness)

**Description**: Liveness probe endpoint. Returns a simple status indicating the application process is running. This endpoint does NOT check external dependencies. Used by Kubernetes liveness probes.

**HTTP Method**: `GET`
**Path**: `/health`

**Rate Limiting**: Exempt (no rate limiting applied).

#### Request Headers

No required headers.

#### Success Response (200 OK)

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

**Note**: The health check endpoint does NOT use the standard success envelope (`{ success, data, meta }`) because it is intended for infrastructure probes (Kubernetes, load balancers) that expect a minimal response format.

#### Example Request (curl)

```bash
curl -X GET "http://localhost:3000/health"
```

#### Example Success Response (200 OK)

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

---

### 2.8 GET /health/ready - Readiness Check

**Description**: Readiness probe endpoint. Checks that the application is ready to serve traffic by verifying connectivity to external dependencies (database). Used by Kubernetes readiness probes.

**HTTP Method**: `GET`
**Path**: `/health/ready`

**Rate Limiting**: Exempt (no rate limiting applied).

#### Request Headers

No required headers.

#### Success Response (200 OK)

Returned when the application and all dependencies are healthy.

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

#### Error Response (503 Service Unavailable)

Returned when one or more dependencies are unhealthy.

```json
{
  "status": "error",
  "database": "disconnected",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

**Note**: Like the liveness probe, the readiness probe does NOT use the standard response envelope.

#### Example Request (curl)

```bash
curl -X GET "http://localhost:3000/health/ready"
```

#### Example Success Response (200 OK)

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

#### Example Error Response (503 Service Unavailable)

```json
{
  "status": "error",
  "database": "disconnected",
  "timestamp": "2024-01-15T12:00:05.000Z"
}
```

---

## 3. Common Response Formats

### 3.1 Success Response Envelope

All successful responses from business endpoints (everything under `/api/v1/`) are wrapped in a standard envelope:

```typescript
/**
 * Standard success response envelope used across all /api/v1 endpoints.
 * @template T - The type of the data payload.
 */
interface SuccessResponse<T> {
  /** Always true for successful responses */
  success: true;

  /** The response payload. Shape varies by endpoint. */
  data: T;

  /** Optional metadata about the response */
  meta?: {
    /** Server-side timestamp in ISO 8601 format */
    timestamp: string;

    /** Correlation ID for request tracing */
    correlationId?: string;
  };
}
```

**Example**:

```json
{
  "success": true,
  "data": {
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "deposit",
    "amount": 100.50,
    "balance_after": 200.50,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00.123Z",
    "correlationId": "550e8400-e29b-41d4-a716-446655440099"
  }
}
```

### 3.2 Error Response Envelope

All error responses use a standard error envelope. This is produced by the `GlobalExceptionFilter`.

```typescript
/**
 * Standard error response envelope used across all endpoints.
 * Produced by the GlobalExceptionFilter.
 */
interface ErrorResponse {
  /** HTTP status code */
  statusCode: number;

  /** Human-readable error message */
  message: string;

  /** HTTP status text (e.g., "Bad Request", "Not Found") */
  error: string;

  /** Server-side timestamp in ISO 8601 format */
  timestamp: string;

  /** The request path that caused the error */
  path: string;

  /**
   * Optional additional details about the error.
   * For validation errors: contains an `errors` array with per-field constraint violations.
   * For business errors: contains relevant context (e.g., currentBalance, requestedAmount).
   * NEVER contains stack traces, SQL, or internal implementation details.
   */
  details?: Record<string, unknown>;
}
```

**Example (Validation Error)**:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/v1/transactions",
  "details": {
    "errors": [
      {
        "field": "amount",
        "constraints": [
          "amount must be greater than zero"
        ]
      }
    ]
  }
}
```

**Example (Business Error)**:

```json
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

### 3.3 Health Check Response (Non-Envelope)

Health check endpoints (`/health`, `/health/ready`) use a simplified format without the standard envelope:

```typescript
/**
 * Liveness probe response.
 */
interface HealthResponse {
  /** "ok" when the application process is running */
  status: 'ok';

  /** Server-side timestamp in ISO 8601 format */
  timestamp: string;
}

/**
 * Readiness probe response.
 */
interface ReadyResponse {
  /** "ok" when all dependencies are healthy, "error" otherwise */
  status: 'ok' | 'error';

  /** Database connectivity status */
  database: 'connected' | 'disconnected';

  /** Server-side timestamp in ISO 8601 format */
  timestamp: string;
}
```

---

## 4. Error Code Reference Table

The following table maps all domain errors to HTTP status codes. The `GlobalExceptionFilter` uses this mapping to transform domain/application exceptions into appropriate HTTP responses.

| Domain Error | HTTP Status | Error Text | Message | When |
|---|---|---|---|---|
| `ValidationError` | 400 | Bad Request | Validation failed | Request body or query parameters fail class-validator constraints |
| `InvalidUuidError` | 400 | Bad Request | `{field}` must be a valid UUID v4 | A field expected to be UUID v4 has an invalid format |
| `InvalidAmountError` | 400 | Bad Request | amount must be a number with at most 2 decimal places | Amount is negative, zero, has too many decimals, or is outside allowed range |
| `MissingFieldError` | 400 | Bad Request | `{field}` is required | A required field is not present in the request |
| `InvalidTypeError` | 400 | Bad Request | type must be either "deposit" or "withdraw" | The `type` field contains an unsupported value |
| `InvalidTimestampError` | 400 | Bad Request | timestamp must be a valid ISO 8601 date string | The `timestamp` field is not valid ISO 8601 |
| `WalletNotFoundError` | 404 | Not Found | Wallet not found for user `{userId}` | GET /wallets/:userId/balance when no wallet exists |
| `FraudAlertNotFoundError` | 404 | Not Found | Fraud alert not found: `{alertId}` | PUT /fraud/alerts/:id/resolve when the alert ID does not exist |
| `DuplicateTransactionError` | 409 | Conflict | A transaction with this ID already exists with different parameters | Same `transaction_id` submitted with different payload fields |
| `InsufficientBalanceError` | 422 | Unprocessable Entity | Insufficient balance | Withdrawal amount exceeds current wallet balance |
| `AlertAlreadyResolvedError` | 422 | Unprocessable Entity | Alert has already been resolved | Attempting to resolve an alert that is already resolved |
| `RateLimitExceededError` | 429 | Too Many Requests | Too many requests. Please try again later. | Client has exceeded the rate limit |
| `InternalError` | 500 | Internal Server Error | An internal error occurred. Please try again later. | Any unhandled exception (details logged server-side, never exposed to client) |

---

## 5. Validation Rules Summary Table

The following table summarizes all input validation rules enforced by `class-validator` decorators at the presentation layer.

| Field | Type | Constraints | Decorators | Error Message |
|---|---|---|---|---|
| `transaction_id` | string | Required, UUID v4 format | `@IsUUID('4')`, `@IsNotEmpty()` | "transaction_id must be a valid UUID v4" / "transaction_id is required" |
| `user_id` (body) | string | Required, UUID v4 format | `@IsUUID('4')`, `@IsNotEmpty()` | "user_id must be a valid UUID v4" / "user_id is required" |
| `user_id` (query) | string | Required, UUID v4 format | `@IsUUID('4')`, `@IsNotEmpty()` | "user_id must be a valid UUID v4" / "user_id is required" |
| `userId` (path) | string | Required, UUID v4 format | `@IsUUID('4')` | "userId must be a valid UUID v4" |
| `id` (path, alert) | string | Required, UUID v4 format | `@IsUUID('4')` | "id must be a valid UUID v4" |
| `amount` | number | Required, positive, min 0.01, max 999,999,999.99, max 2 decimal places, no NaN, no Infinity | `@IsNumber({maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false})`, `@IsPositive()`, `@Min(0.01)`, `@Max(999999999.99)` | "amount must be a number with at most 2 decimal places" / "amount must be greater than zero" / "Minimum transaction amount is 0.01" / "Maximum transaction amount is 999,999,999.99" |
| `type` | string | Required, must be "deposit" or "withdraw" | `@IsIn(['deposit', 'withdraw'])`, `@IsNotEmpty()` | "type must be either \"deposit\" or \"withdraw\"" / "type is required" |
| `timestamp` | string | Required, strict ISO 8601 format | `@IsISO8601({strict: true})`, `@IsNotEmpty()` | "timestamp must be a valid ISO 8601 date string" / "timestamp is required" |
| `resolved` (query) | string | Optional, must be "true" or "false" | `@IsOptional()`, `@IsIn(['true', 'false'])` | "resolved must be \"true\" or \"false\"" |
| `resolution_notes` | string | Optional, max 500 characters | `@IsOptional()`, `@IsString()`, `@MaxLength(500)` | "resolution_notes must be a string" / "resolution_notes cannot exceed 500 characters" |

### Global ValidationPipe Configuration

The following `ValidationPipe` is registered globally and applies to all incoming requests:

```typescript
new ValidationPipe({
  whitelist: true,                // Strip properties without decorators
  forbidNonWhitelisted: true,     // Reject requests with unknown properties
  transform: true,                // Transform payloads to DTO instances
  transformOptions: {
    enableImplicitConversion: false, // Do NOT implicitly convert types
  },
  stopAtFirstError: false,        // Return ALL validation errors at once
  exceptionFactory: (errors) => {
    const messages = errors.map((error) => ({
      field: error.property,
      constraints: Object.values(error.constraints || {}),
    }));
    return new BadRequestException({
      statusCode: 400,
      message: 'Validation failed',
      errors: messages,
    });
  },
})
```

---

## 6. Request/Response DTO TypeScript Definitions

This section provides the complete TypeScript definitions for all DTOs used in the API. These are presentation-layer DTOs that map between HTTP requests/responses and application-layer use case inputs/outputs.

### 6.1 CreateTransactionRequestDto

```typescript
// src/presentation/dtos/create-transaction-request.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  Min,
  Max,
  IsIn,
  IsISO8601,
} from 'class-validator';

/**
 * DTO for creating a new transaction (deposit or withdrawal).
 * The transaction_id serves as an idempotency key.
 */
export class CreateTransactionRequestDto {
  @ApiProperty({
    description: 'Unique transaction ID (UUID v4) used as idempotency key',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'transaction_id must be a valid UUID v4' })
  @IsNotEmpty({ message: 'transaction_id is required' })
  transaction_id: string;

  @ApiProperty({
    description: 'User ID (UUID v4) identifying the wallet owner',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'user_id must be a valid UUID v4' })
  @IsNotEmpty({ message: 'user_id is required' })
  user_id: string;

  @ApiProperty({
    description: 'Transaction amount. Must be positive with at most 2 decimal places.',
    example: 100.50,
    minimum: 0.01,
    maximum: 999999999.99,
    type: 'number',
  })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @IsPositive({ message: 'amount must be greater than zero' })
  @Min(0.01, { message: 'Minimum transaction amount is 0.01' })
  @Max(999999999.99, { message: 'Maximum transaction amount is 999,999,999.99' })
  amount: number;

  @ApiProperty({
    description: 'Transaction type: deposit to add funds, withdraw to remove funds',
    enum: ['deposit', 'withdraw'],
    example: 'deposit',
  })
  @IsIn(['deposit', 'withdraw'], {
    message: 'type must be either "deposit" or "withdraw"',
  })
  @IsNotEmpty({ message: 'type is required' })
  type: string;

  @ApiProperty({
    description: 'Client-side timestamp when the transaction was initiated (ISO 8601)',
    example: '2024-01-15T10:30:00Z',
    type: 'string',
    format: 'date-time',
  })
  @IsISO8601({ strict: true }, { message: 'timestamp must be a valid ISO 8601 date string' })
  @IsNotEmpty({ message: 'timestamp is required' })
  timestamp: string;
}
```

### 6.2 TransactionResponseDto

```typescript
// src/presentation/dtos/transaction-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { ProcessTransactionOutput } from '../../application/dtos/process-transaction.dto';

/**
 * DTO representing a single transaction in API responses.
 * Used by both POST /transactions (single) and GET /transactions (list).
 */
export class TransactionResponseDto {
  @ApiProperty({
    description: 'Unique transaction ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  transaction_id: string;

  @ApiProperty({
    description: 'Transaction type',
    enum: ['deposit', 'withdraw'],
    example: 'deposit',
  })
  type: string;

  @ApiProperty({
    description: 'Transaction amount',
    example: 100.50,
    type: 'number',
  })
  amount: number;

  @ApiProperty({
    description: 'Wallet balance after this transaction was processed',
    example: 200.50,
    type: 'number',
  })
  balance_after: number;

  @ApiProperty({
    description: 'Timestamp when the transaction was processed (ISO 8601)',
    example: '2024-01-15T10:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  timestamp: string;

  /**
   * Maps an application-layer use case output to a presentation-layer response DTO.
   * This static factory method ensures the presentation layer controls the response shape.
   */
  static fromUseCaseOutput(output: ProcessTransactionOutput): TransactionResponseDto {
    const dto = new TransactionResponseDto();
    dto.transaction_id = output.transactionId;
    dto.type = output.type.toLowerCase();
    dto.amount = output.amount;
    dto.balance_after = output.balanceAfter;
    dto.timestamp = output.timestamp.toISOString();
    return dto;
  }
}
```

### 6.3 TransactionHistoryResponseDto

```typescript
// src/presentation/dtos/transaction-history-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { TransactionResponseDto } from './transaction-response.dto';

/**
 * DTO for the GET /transactions response payload (inside the success envelope).
 */
export class TransactionHistoryResponseDto {
  @ApiProperty({
    description: 'List of transactions ordered by timestamp descending',
    type: [TransactionResponseDto],
  })
  transactions: TransactionResponseDto[];

  @ApiProperty({
    description: 'Total number of transactions in the list',
    example: 2,
    type: 'number',
  })
  total: number;
}
```

### 6.4 BalanceResponseDto

```typescript
// src/presentation/dtos/balance-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for the GET /wallets/:userId/balance response payload (inside the success envelope).
 */
export class BalanceResponseDto {
  @ApiProperty({
    description: 'User ID (UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  user_id: string;

  @ApiProperty({
    description: 'Current wallet balance',
    example: 50.50,
    type: 'number',
  })
  balance: number;

  @ApiProperty({
    description: 'Timestamp of the last balance update (ISO 8601)',
    example: '2024-01-15T11:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  last_updated: string;
}
```

### 6.5 FraudAlertResponseDto

```typescript
// src/presentation/dtos/fraud-alert-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO representing a single fraud alert in API responses.
 */
export class FraudAlertResponseDto {
  @ApiProperty({
    description: 'Unique alert ID',
    example: '660e8400-e29b-41d4-a716-446655440010',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description: 'ID of the transaction that triggered this alert',
    example: '550e8400-e29b-41d4-a716-446655440005',
    format: 'uuid',
  })
  transaction_id: string;

  @ApiProperty({
    description: 'ID of the user associated with this alert',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  user_id: string;

  @ApiProperty({
    description: 'Type of fraud rule that was triggered',
    enum: ['HIGH_AMOUNT', 'VELOCITY_EXCEEDED'],
    example: 'HIGH_AMOUNT',
  })
  alert_type: string;

  @ApiProperty({
    description: 'Severity of the alert',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    example: 'MEDIUM',
  })
  severity: string;

  @ApiProperty({
    description: 'Additional details about why the alert was triggered',
    example: { amount: 25000, threshold: 10000 },
    type: 'object',
  })
  details: Record<string, unknown>;

  @ApiProperty({
    description: 'Whether the alert has been resolved',
    example: false,
    type: 'boolean',
  })
  resolved: boolean;

  @ApiPropertyOptional({
    description: 'Timestamp when the alert was resolved (null if unresolved)',
    example: '2024-01-15T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
    nullable: true,
  })
  resolved_at: string | null;

  @ApiPropertyOptional({
    description: 'Notes added when the alert was resolved (null if unresolved)',
    example: 'Verified with user, legitimate transaction',
    type: 'string',
    nullable: true,
  })
  resolution_notes: string | null;

  @ApiProperty({
    description: 'Timestamp when the alert was created (ISO 8601)',
    example: '2024-01-15T10:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  created_at: string;
}
```

### 6.6 FraudAlertListResponseDto

```typescript
// src/presentation/dtos/fraud-alert-list-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { FraudAlertResponseDto } from './fraud-alert-response.dto';

/**
 * DTO for the GET /fraud/alerts and GET /fraud/alerts/:userId response payload
 * (inside the success envelope).
 */
export class FraudAlertListResponseDto {
  @ApiProperty({
    description: 'List of fraud alerts ordered by created_at descending',
    type: [FraudAlertResponseDto],
  })
  alerts: FraudAlertResponseDto[];

  @ApiProperty({
    description: 'Total number of alerts in the list',
    example: 1,
    type: 'number',
  })
  total: number;
}
```

### 6.7 ResolveAlertRequestDto

```typescript
// src/presentation/dtos/resolve-alert-request.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for the PUT /fraud/alerts/:id/resolve request body.
 */
export class ResolveAlertRequestDto {
  @ApiPropertyOptional({
    description: 'Notes describing the resolution action taken',
    example: 'Verified with user, legitimate transaction',
    maxLength: 500,
    type: 'string',
  })
  @IsOptional()
  @IsString({ message: 'resolution_notes must be a string' })
  @MaxLength(500, { message: 'resolution_notes cannot exceed 500 characters' })
  resolution_notes?: string;
}
```

### 6.8 ResolveAlertResponseDto

```typescript
// src/presentation/dtos/resolve-alert-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for the PUT /fraud/alerts/:id/resolve response payload (inside the success envelope).
 */
export class ResolveAlertResponseDto {
  @ApiProperty({
    description: 'Alert ID',
    example: '660e8400-e29b-41d4-a716-446655440010',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description: 'Resolution status (always true in this response)',
    example: true,
    type: 'boolean',
  })
  resolved: boolean;

  @ApiProperty({
    description: 'Timestamp when the alert was resolved (ISO 8601)',
    example: '2024-01-15T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  resolved_at: string;

  @ApiPropertyOptional({
    description: 'Resolution notes if provided',
    example: 'Verified with user, legitimate transaction',
    type: 'string',
    nullable: true,
  })
  resolution_notes: string | null;
}
```

### 6.9 HealthResponseDto

```typescript
// src/presentation/dtos/health-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for the GET /health liveness probe response.
 * Does NOT use the standard success envelope.
 */
export class HealthResponseDto {
  @ApiProperty({
    description: 'Application status',
    example: 'ok',
    enum: ['ok'],
  })
  status: 'ok';

  @ApiProperty({
    description: 'Server timestamp (ISO 8601)',
    example: '2024-01-15T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  timestamp: string;
}
```

### 6.10 ReadyResponseDto

```typescript
// src/presentation/dtos/ready-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for the GET /health/ready readiness probe response.
 * Does NOT use the standard success envelope.
 */
export class ReadyResponseDto {
  @ApiProperty({
    description: 'Overall application readiness status',
    example: 'ok',
    enum: ['ok', 'error'],
  })
  status: 'ok' | 'error';

  @ApiProperty({
    description: 'Database connectivity status',
    example: 'connected',
    enum: ['connected', 'disconnected'],
  })
  database: 'connected' | 'disconnected';

  @ApiProperty({
    description: 'Server timestamp (ISO 8601)',
    example: '2024-01-15T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  timestamp: string;
}
```

---

## 7. Idempotency Behavior

### Overview

The `POST /api/v1/transactions` endpoint supports idempotent transaction processing using the `transaction_id` field as an idempotency key. This prevents duplicate processing when a client retries a request due to network failures, timeouts, or other transient errors.

### How It Works

The `transaction_id` is a client-generated UUID v4 that uniquely identifies a logical transaction. The database enforces a unique constraint on this field. The system uses this to detect and handle duplicate submissions.

### Scenario 1: First Request (Normal Processing)

When a `transaction_id` is submitted for the first time, the transaction is processed normally.

**Request**:

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

**Response (201 Created)**:

```json
{
  "success": true,
  "data": {
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "deposit",
    "amount": 100.50,
    "balance_after": 100.50,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00.123Z",
    "correlationId": "aaa11111-bb22-cc33-dd44-eeeeeeffffff"
  }
}
```

**Processing Flow**:

```
1. Check if transaction_id exists in the database
2. Not found -> proceed with normal processing
3. Validate business rules (balance check for withdrawals)
4. Acquire wallet lock (SELECT ... FOR UPDATE)
5. Update wallet balance
6. Save transaction record (with unique constraint on transaction_id)
7. Run fraud detection (async)
8. Return 201 Created with transaction result
```

### Scenario 2: Duplicate Request (Same Payload)

When the same `transaction_id` is submitted again with identical payload fields (`user_id`, `amount`, `type`, `timestamp`), the original result is returned with status `200 OK` instead of `201 Created`. The transaction is NOT processed again.

**Request** (identical to the first):

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

**Response (200 OK)** -- returns the original transaction result:

```json
{
  "success": true,
  "data": {
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "deposit",
    "amount": 100.50,
    "balance_after": 100.50,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:05.456Z",
    "correlationId": "bbb22222-cc33-dd44-ee55-ffffffffffff"
  }
}
```

**Processing Flow**:

```
1. Check if transaction_id exists in the database
2. Found -> retrieve the existing transaction record
3. Compare request payload with stored transaction:
   - user_id matches
   - amount matches
   - type matches
   - timestamp matches
4. All fields match -> return original result with 200 OK
5. No balance update, no new transaction record, no fraud check
```

**Key differences from the first request**:
- Status code is `200 OK` instead of `201 Created`
- The `meta.timestamp` reflects the current request time, not the original processing time
- The `meta.correlationId` is the current request's correlation ID
- The `data` payload is identical to the original response

### Scenario 3: Conflicting Duplicate (Same ID, Different Payload)

When the same `transaction_id` is submitted with different payload fields, the server returns `409 Conflict`. This indicates a misuse of the idempotency key -- the client should generate a new `transaction_id` for a different logical transaction.

**Request** (same transaction_id, different amount):

```bash
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "amount": 200.00,
    "type": "deposit",
    "timestamp": "2024-01-15T10:30:00Z"
  }'
```

**Response (409 Conflict)**:

```json
{
  "statusCode": 409,
  "message": "A transaction with this ID already exists with different parameters",
  "error": "Conflict",
  "timestamp": "2024-01-15T10:31:00.000Z",
  "path": "/api/v1/transactions",
  "details": {
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Processing Flow**:

```
1. Check if transaction_id exists in the database
2. Found -> retrieve the existing transaction record
3. Compare request payload with stored transaction:
   - amount does NOT match (100.50 vs 200.00)
4. Payload mismatch -> return 409 Conflict
5. No processing, no balance update
```

### Implementation Details

The idempotency check is performed at the beginning of the `ProcessTransactionUseCase`:

```typescript
async execute(input: ProcessTransactionInput): Promise<ProcessTransactionOutput> {
  // 1. Check for existing transaction with this idempotency key
  const existing = await this.transactionRepository.findByIdempotencyKey(
    input.transactionId,
  );

  if (existing) {
    // 2. Verify the payload matches
    if (
      existing.userId === input.userId &&
      existing.amount.value === input.amount &&
      existing.type === input.type
    ) {
      // 3a. Same payload -> return original result (controller returns 200)
      return this.toOutput(existing);
    } else {
      // 3b. Different payload -> conflict
      throw new DuplicateTransactionException(input.transactionId);
    }
  }

  // 4. New transaction -> process normally (controller returns 201)
  // ... normal processing logic
}
```

The controller differentiates between first-time and duplicate responses:

```typescript
@Post()
async process(@Body() dto: CreateTransactionRequestDto): Promise<SuccessResponse<TransactionResponseDto>> {
  const result = await this.processTransaction.execute({
    transactionId: dto.transaction_id,
    userId: dto.user_id,
    amount: dto.amount,
    type: dto.type.toUpperCase() as 'DEPOSIT' | 'WITHDRAW',
    timestamp: new Date(dto.timestamp),
  });

  const responseDto = TransactionResponseDto.fromUseCaseOutput(result);

  // Use case returns an `isNew` flag to differentiate first vs duplicate
  if (result.isNew) {
    // First request: 201 Created
    return { success: true, data: responseDto, meta: { timestamp: new Date().toISOString() } };
  } else {
    // Duplicate request: 200 OK (set via @HttpCode or response object)
    return { success: true, data: responseDto, meta: { timestamp: new Date().toISOString() } };
  }
}
```

### Client Guidelines

1. **Generate a UUID v4 for each logical transaction**. Use `crypto.randomUUID()` on the client side.
2. **Reuse the same `transaction_id` only for retries** of the exact same transaction. Do not reuse it for different transactions.
3. **Treat 200 and 201 as success**. Both indicate the transaction was processed. The status code only tells you whether it was a first-time processing (201) or a duplicate detection (200).
4. **Treat 409 as a client error**. It means you accidentally reused a `transaction_id` for a different transaction. Generate a new UUID and retry.
5. **Store the `transaction_id` on the client** before sending the request. If the request times out or the network fails, retry with the same `transaction_id` to avoid double-processing.

### Database Schema Support

The `transactions` table has a unique constraint on the idempotency key column:

```prisma
model Transaction {
  id            String          @id @default(uuid()) @db.Uuid
  userId        String          @map("user_id") @db.Uuid
  amount        Decimal         @db.Decimal(15, 2)
  type          TransactionType
  balanceAfter  Decimal         @map("balance_after") @db.Decimal(15, 2)
  createdAt     DateTime        @default(now()) @map("created_at")

  @@unique([id])  // transaction_id is the primary key and idempotency key
  @@map("transactions")
  @@index([userId, createdAt])
}
```

The primary key `id` serves as both the transaction identifier and the idempotency key, as the client provides the `transaction_id` which becomes the record's `id`.

---

## Appendix A: Endpoint Summary Table

| # | Method | Path | Description | Auth | Rate Limited |
|---|--------|------|-------------|------|-------------|
| 1 | POST | /api/v1/transactions | Process deposit or withdrawal | None | Yes |
| 2 | GET | /api/v1/transactions | Get transaction history by user | None | Yes |
| 3 | GET | /api/v1/wallets/:userId/balance | Get current wallet balance | None | Yes |
| 4 | GET | /api/v1/fraud/alerts | List all fraud alerts | None | Yes |
| 5 | GET | /api/v1/fraud/alerts/:userId | Get fraud alerts by user | None | Yes |
| 6 | PUT | /api/v1/fraud/alerts/:id/resolve | Resolve a fraud alert | None | Yes |
| 7 | GET | /health | Liveness probe | None | No |
| 8 | GET | /health/ready | Readiness probe | None | No |

## Appendix B: Swagger/OpenAPI Integration

All endpoints are documented using `@nestjs/swagger` decorators for automatic OpenAPI 3.0 spec generation:

```typescript
// Controller-level decorators
@ApiTags('Transactions')           // Groups endpoints in Swagger UI
@Controller('api/v1/transactions')

// Endpoint-level decorators
@Post()
@ApiOperation({ summary: 'Process a transaction (deposit or withdraw)' })
@ApiResponse({ status: 201, description: 'Transaction processed successfully', type: TransactionResponseDto })
@ApiResponse({ status: 200, description: 'Duplicate transaction detected (idempotent)', type: TransactionResponseDto })
@ApiResponse({ status: 400, description: 'Validation error' })
@ApiResponse({ status: 409, description: 'Transaction ID conflict (different payload)' })
@ApiResponse({ status: 422, description: 'Business rule violation (e.g., insufficient balance)' })
@ApiResponse({ status: 429, description: 'Rate limit exceeded' })
@ApiResponse({ status: 500, description: 'Internal server error' })

// Query parameter decorators
@ApiQuery({ name: 'user_id', required: true, type: String, description: 'User UUID v4' })

// Path parameter decorators
@ApiParam({ name: 'userId', required: true, type: String, description: 'User UUID v4' })
```

The Swagger UI is available at `/api/docs` in development mode.

---

> **Document Status**: APPROVED
> **Author**: architect agent, Phase 2 - Design
> **AI-Driven**: architect agent, Design Phase parallel execution
