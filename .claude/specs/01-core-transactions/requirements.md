# Feature: Core Transaction Processing

## Overview
Implement the core transaction processing functionality for the digital wallet,
including deposits, withdrawals, balance queries, and transaction history.

## User Stories

### US-001: Process Deposit Transaction

**As a** wallet user  
**I want to** deposit money into my wallet  
**So that** I can increase my available balance

**Acceptance Criteria:**
- Amount MUST be a positive number (> 0)
- Amount MUST have at most 2 decimal places
- Transaction ID MUST be provided (for idempotency)
- User ID MUST be provided
- Timestamp MUST be provided
- If wallet doesn't exist, create it with zero balance first
- Balance MUST be updated atomically
- Transaction MUST be recorded with all details
- Response MUST include new balance

**Request Example:**
```json
POST /api/v1/transactions
{
  "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "550e8400-e29b-41d4-a716-446655440001",
  "amount": 100.50,
  "type": "deposit",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Response Example (201 Created):**
```json
{
  "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "deposit",
  "amount": 100.50,
  "balance_after": 100.50,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Error Cases:**
- 400: Invalid amount (negative, zero, or too many decimals)
- 400: Missing required fields
- 400: Invalid UUID format

---

### US-002: Process Withdrawal Transaction

**As a** wallet user  
**I want to** withdraw money from my wallet  
**So that** I can use my funds

**Acceptance Criteria:**
- Amount MUST be a positive number (> 0)
- Amount MUST NOT exceed current balance
- Transaction ID MUST be provided (for idempotency)
- Balance MUST be updated atomically
- Transaction MUST be recorded
- Response MUST include new balance

**Request Example:**
```json
POST /api/v1/transactions
{
  "transaction_id": "550e8400-e29b-41d4-a716-446655440002",
  "user_id": "550e8400-e29b-41d4-a716-446655440001",
  "amount": 50.00,
  "type": "withdraw",
  "timestamp": "2024-01-15T11:00:00Z"
}
```

**Response Example (201 Created):**
```json
{
  "transaction_id": "550e8400-e29b-41d4-a716-446655440002",
  "type": "withdraw",
  "amount": 50.00,
  "balance_after": 50.50,
  "timestamp": "2024-01-15T11:00:00.000Z"
}
```

**Error Cases:**
- 400: Invalid amount
- 422: Insufficient balance (include current balance and requested amount)
- 404: User wallet not found (for withdraw without prior deposit)

---

### US-003: Get Transaction History

**As a** wallet user  
**I want to** see my transaction history  
**So that** I can track my financial activity

**Acceptance Criteria:**
- User ID MUST be provided as query parameter
- Returns list of all transactions for the user
- Ordered by timestamp descending (newest first)
- Each transaction includes: id, type, amount, balance_after, timestamp

**Request Example:**
```
GET /api/v1/transactions?user_id=550e8400-e29b-41d4-a716-446655440001
```

**Response Example (200 OK):**
```json
{
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
}
```

**Error Cases:**
- 400: Missing user_id parameter
- 400: Invalid UUID format

---

### US-004: Get Current Balance

**As a** wallet user  
**I want to** see my current balance  
**So that** I know my available funds

**Acceptance Criteria:**
- User ID MUST be provided in URL path
- Returns current balance for the user
- Includes last update timestamp

**Request Example:**
```
GET /api/v1/wallets/550e8400-e29b-41d4-a716-446655440001/balance
```

**Response Example (200 OK):**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440001",
  "balance": 50.50,
  "last_updated": "2024-01-15T11:00:00.000Z"
}
```

**Error Cases:**
- 400: Invalid UUID format
- 404: User wallet not found

---

## Technical Requirements

### Data Validation
- All amounts: positive, max 2 decimal places, max value 999,999,999.99
- All UUIDs: v4 format
- Timestamps: ISO 8601 format

### Atomicity
- Wallet balance update and transaction recording MUST be atomic
- Use database transactions

### Idempotency
- Same transaction_id should return same result
- Prevent duplicate processing

### Logging
- Log all transaction attempts
- Log errors with context
- Include transaction_id and user_id in all logs

### Performance
- Transaction processing: < 200ms p99
- Balance query: < 50ms p99

---

## API Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/transactions | Process deposit or withdrawal |
| GET | /api/v1/transactions | Get transaction history |
| GET | /api/v1/wallets/:userId/balance | Get current balance |
| GET | /health | Health check |
