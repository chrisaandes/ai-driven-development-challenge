# API Documentation

**Base URL**: `/api/v1`
**Content-Type**: `application/json`
**Swagger UI**: `/api/docs` (development mode)

---

## Authentication

Authentication is **out of scope** for this version. All endpoints are publicly accessible. The architecture supports adding JWT guards without modifying business logic.

## Rate Limiting

| Window | Max Requests | Scope |
|--------|-------------|-------|
| 1 second | 10 | Per IP |
| 1 minute | 100 | Per IP |

Health endpoints (`/health`, `/health/ready`) are exempt.

---

## Endpoints

### 1. POST /api/v1/transactions

Process a financial transaction (deposit or withdrawal).

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transaction_id` | string (UUID v4) | Yes | Idempotency key |
| `user_id` | string (UUID v4) | Yes | Wallet owner |
| `amount` | number | Yes | 0.01 - 999,999,999.99 (max 2 decimals) |
| `type` | string | Yes | `"deposit"` or `"withdraw"` |
| `timestamp` | string (ISO 8601) | Yes | Client timestamp |

**Example Request:**
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

**Success Response (201 Created - new transaction):**
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
    "timestamp": "2024-01-15T10:30:00.123Z"
  }
}
```

**Idempotent Response (200 OK - duplicate with same payload):**
Same response body, but status 200.

**Error Responses:**

| Status | When |
|--------|------|
| 400 | Validation error (invalid UUID, missing field, invalid amount) |
| 409 | Same transaction_id with different payload |
| 422 | Insufficient balance for withdrawal |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

**422 Example (Insufficient Balance):**
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

---

### 2. GET /api/v1/transactions

Get transaction history for a user (newest first).

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string (UUID v4) | Yes | Wallet owner |

**Example Request:**
```bash
curl "http://localhost:3000/api/v1/transactions?user_id=550e8400-e29b-41d4-a716-446655440001"
```

**Success Response (200 OK):**
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
    "timestamp": "2024-01-15T11:05:00.000Z"
  }
}
```

---

### 3. GET /api/v1/wallets/:userId/balance

Get current wallet balance.

**Path Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `userId` | string (UUID v4) | Yes |

**Example Request:**
```bash
curl "http://localhost:3000/api/v1/wallets/550e8400-e29b-41d4-a716-446655440001/balance"
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "balance": 50.50,
    "last_updated": "2024-01-15T11:00:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-15T11:05:00.000Z"
  }
}
```

**Error Responses:**

| Status | When |
|--------|------|
| 400 | Invalid UUID format |
| 404 | No wallet exists for userId |

---

### 4. GET /api/v1/fraud/alerts

List all fraud alerts (newest first).

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resolved` | string | No | `"true"` or `"false"` to filter |

**Example Request:**
```bash
curl "http://localhost:3000/api/v1/fraud/alerts?resolved=false"
```

**Success Response (200 OK):**
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
        "details": { "amount": 25000, "threshold": 10000 },
        "resolved": false,
        "resolved_at": null,
        "resolution_notes": null,
        "created_at": "2024-01-15T10:30:00.000Z"
      }
    ],
    "total": 1
  },
  "meta": {
    "timestamp": "2024-01-15T12:00:00.000Z"
  }
}
```

---

### 5. GET /api/v1/fraud/alerts/:userId

Get fraud alerts for a specific user.

**Path Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `userId` | string (UUID v4) | Yes |

**Example Request:**
```bash
curl "http://localhost:3000/api/v1/fraud/alerts/550e8400-e29b-41d4-a716-446655440001"
```

**Response**: Same format as endpoint 4.

---

### 6. PUT /api/v1/fraud/alerts/:id/resolve

Resolve a fraud alert.

**Path Parameters:**

| Parameter | Type | Required |
|-----------|------|----------|
| `id` | string (UUID v4) | Yes |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resolution_notes` | string | No | Max 500 characters |

**Example Request:**
```bash
curl -X PUT "http://localhost:3000/api/v1/fraud/alerts/660e8400-e29b-41d4-a716-446655440010/resolve" \
  -H "Content-Type: application/json" \
  -d '{ "resolution_notes": "Verified with user, legitimate transaction" }'
```

**Success Response (200 OK):**
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
    "timestamp": "2024-01-15T12:00:00.123Z"
  }
}
```

**Error Responses:**

| Status | When |
|--------|------|
| 400 | Invalid UUID or resolution_notes > 500 chars |
| 404 | Alert not found |
| 422 | Alert already resolved |

---

### 7. GET /health

Liveness probe (K8s). No rate limiting.

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

---

### 8. GET /health/ready

Readiness probe (K8s). Checks database connectivity. No rate limiting.

**Response (200 OK):**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "error",
  "database": "disconnected",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

---

## Common Error Format

All errors follow this structure:

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
        "constraints": ["amount must be greater than zero"]
      }
    ]
  }
}
```

## Fraud Detection Configuration

Environment variables controlling fraud rules:

| Variable | Default | Description |
|----------|---------|-------------|
| `FRAUD_AMOUNT_THRESHOLD` | 10000 | Amount above which alerts are generated |
| `FRAUD_VELOCITY_WINDOW_MINUTES` | 5 | Time window for velocity checks |
| `FRAUD_VELOCITY_MAX_TRANSACTIONS` | 10 | Max transactions in window |

### Alert Severity Rules

**High Amount:**
- LOW: amount > threshold and < 2x threshold
- MEDIUM: amount >= 2x threshold and < 5x threshold
- HIGH: amount >= 5x threshold

**Velocity:**
- MEDIUM: count > max
- HIGH: count > 2x max
- CRITICAL: count > 5x max

---

> **Full OpenAPI spec available at `/api/docs` when running in development mode.**
