# Feature: Fraud Detection System

## Overview
Implement a basic fraud detection mechanism to identify suspicious transaction
patterns and generate alerts for review.

## User Stories

### US-005: Detect High Amount Transactions

**As a** system operator  
**I want to** flag transactions above a threshold  
**So that** I can review potentially fraudulent high-value transactions

**Acceptance Criteria:**
- Configurable threshold amount (default: 10,000)
- Flag transactions where amount > threshold
- Create alert with severity based on how much over threshold
- Transaction should still process (alert is separate)

**Alert Severity:**
- LOW: amount > threshold and < 2x threshold
- MEDIUM: amount >= 2x threshold and < 5x threshold
- HIGH: amount >= 5x threshold

---

### US-006: Detect Rapid Transaction Velocity

**As a** system operator  
**I want to** detect when a user makes too many transactions quickly  
**So that** I can identify potential automated fraud

**Acceptance Criteria:**
- Configurable window (default: 5 minutes)
- Configurable max transactions (default: 10)
- Flag when transaction count in window exceeds max
- Include transaction count in alert details

**Alert Severity:**
- MEDIUM: transactions > max
- HIGH: transactions > 2x max
- CRITICAL: transactions > 5x max

---

### US-007: List Fraud Alerts

**As a** system operator  
**I want to** see all fraud alerts  
**So that** I can review and take action

**Acceptance Criteria:**
- Returns list of alerts
- Filter by resolved/unresolved status
- Ordered by creation time descending
- Includes all alert details

**Request Example:**
```
GET /api/v1/fraud/alerts?resolved=false
```

**Response Example (200 OK):**
```json
{
  "alerts": [
    {
      "id": "alert-uuid",
      "transaction_id": "tx-uuid",
      "user_id": "user-uuid",
      "alert_type": "HIGH_AMOUNT",
      "severity": "MEDIUM",
      "details": {
        "amount": 25000,
        "threshold": 10000
      },
      "resolved": false,
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 1
}
```

---

### US-008: Get Alerts by User

**As a** system operator  
**I want to** see alerts for a specific user  
**So that** I can assess user risk profile

**Request Example:**
```
GET /api/v1/fraud/alerts/550e8400-e29b-41d4-a716-446655440001
```

---

### US-009: Resolve Alert

**As a** system operator  
**I want to** mark an alert as resolved  
**So that** I can track which alerts have been reviewed

**Request Example:**
```json
PUT /api/v1/fraud/alerts/alert-uuid/resolve
{
  "resolution_notes": "Verified with user, legitimate transaction"
}
```

**Response Example (200 OK):**
```json
{
  "id": "alert-uuid",
  "resolved": true,
  "resolved_at": "2024-01-15T12:00:00.000Z"
}
```

---

## Technical Design

### Domain Service: FraudDetectionService

```typescript
interface FraudConfig {
  amountThreshold: number;       // Default: 10000
  velocityWindowMinutes: number; // Default: 5
  velocityMaxTransactions: number; // Default: 10
}

class FraudDetectionService {
  analyze(
    transaction: Transaction,
    recentTransactions: Transaction[],
  ): FraudAnalysisResult;
}
```

### Integration Point

Fraud detection runs AFTER successful transaction processing:

```
1. Validate transaction
2. Update wallet balance
3. Save transaction
4. Run fraud detection (async)
5. If alerts generated, save alerts
6. Return transaction result to user
```

### Configuration

Environment variables:
```
FRAUD_AMOUNT_THRESHOLD=10000
FRAUD_VELOCITY_WINDOW_MINUTES=5
FRAUD_VELOCITY_MAX_TRANSACTIONS=10
```

### Database Schema

```sql
CREATE TABLE fraud_alerts (
  id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL,
  user_id UUID NOT NULL,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  details JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fraud_alerts_user ON fraud_alerts(user_id, created_at DESC);
CREATE INDEX idx_fraud_alerts_unresolved ON fraud_alerts(resolved, created_at DESC);
```

---

## API Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/fraud/alerts | List all alerts |
| GET | /api/v1/fraud/alerts/:userId | Get alerts by user |
| PUT | /api/v1/fraud/alerts/:id/resolve | Resolve an alert |
