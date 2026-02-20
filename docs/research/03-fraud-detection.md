# Fraud Detection Research for Digital Wallets

> **Research Agent**: fraud-researcher
> **Date**: 2026-02-20
> **Context**: Refacil Wallet - Digital wallet microservice (NestJS + PostgreSQL + Prisma)
> **Target Scale**: 1,000 TPS peak

---

## Table of Contents

1. [Velocity Checks (Transactions Per Time Window)](#1-velocity-checks-transactions-per-time-window)
2. [Amount Threshold Detection](#2-amount-threshold-detection)
3. [Pattern Recognition for Suspicious Behavior](#3-pattern-recognition-for-suspicious-behavior)
4. [Configurable Rule Engine Design](#4-configurable-rule-engine-design)
5. [Real-Time vs Batch Detection Tradeoffs](#5-real-time-vs-batch-detection-tradeoffs)
6. [Alert Management](#6-alert-management)
7. [Recommendations for This Project](#7-recommendations-for-this-project)

---

## 1. Velocity Checks (Transactions Per Time Window)

Velocity checks detect abuse by counting the number of transactions a user initiates within a sliding time window. A sudden burst of transactions is a strong indicator of automated fraud, account takeover, or card testing attacks.

### 1.1 Sliding Window Algorithm

The core concept is straightforward: given a window of `W` minutes, count the number of transactions for user `U` within `[now - W, now]`. If the count exceeds a configured threshold `M`, flag or block the transaction.

Two primary strategies exist:

**Fixed Window**: Divide time into non-overlapping buckets (e.g., 5-minute blocks starting at :00, :05, :10). Count transactions per bucket. This is simple but suffers from **boundary effects** -- a user could execute `M-1` transactions at 10:04 and `M-1` more at 10:05, effectively doubling throughput at the window boundary.

**Sliding Window**: The window moves with each new transaction, always looking back exactly `W` minutes from the current timestamp. This eliminates boundary effects but requires more computation.

**Hybrid (Sliding Window Counter)**: Combine the fixed window approach with interpolation. Keep counts for the current and previous fixed windows, then estimate the sliding window count as:

```
estimate = previousWindowCount * overlapFraction + currentWindowCount
```

Where `overlapFraction` is the fraction of the previous window that falls within the sliding window. This provides a good approximation with O(1) memory per user.

### 1.2 Database Query Implementation (PostgreSQL)

For a system at 1,000 TPS, the database approach works well for velocity checks because:
- The query is per-user, so the actual load is distributed
- With proper indexing, the COUNT query is fast
- It provides consistency (no state synchronization issues across instances)

**Prisma query pattern:**

```typescript
async countRecentTransactions(
  userId: string,
  windowMinutes: number,
): Promise<number> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  return this.prisma.transaction.count({
    where: {
      userId,
      createdAt: {
        gte: windowStart,
      },
      status: {
        in: ['COMPLETED', 'PENDING'],
      },
    },
  });
}
```

**Raw SQL for more control:**

```sql
SELECT COUNT(*) as tx_count
FROM transactions
WHERE user_id = $1
  AND created_at >= NOW() - INTERVAL '5 minutes'
  AND status IN ('COMPLETED', 'PENDING');
```

**Required index:**

```sql
CREATE INDEX idx_transactions_user_created
ON transactions (user_id, created_at DESC)
WHERE status IN ('COMPLETED', 'PENDING');
```

This partial index is critical for performance. At 1,000 TPS globally, the per-user query will typically scan very few rows (most users have single-digit transactions per 5-minute window).

### 1.3 In-Memory Approaches (High-Performance Path)

For latency-sensitive scenarios or much higher scale, in-memory approaches avoid database round-trips entirely.

**Ring Buffer (Per-User Circular Buffer):**

```typescript
class VelocityRingBuffer {
  private timestamps: number[];
  private head: number = 0;
  private count: number = 0;

  constructor(private readonly maxSize: number) {
    this.timestamps = new Array(maxSize).fill(0);
  }

  /**
   * Record a transaction timestamp and return current count within window.
   */
  recordAndCount(windowMs: number): number {
    const now = Date.now();
    this.timestamps[this.head] = now;
    this.head = (this.head + 1) % this.maxSize;
    this.count = Math.min(this.count + 1, this.maxSize);

    const cutoff = now - windowMs;
    let activeCount = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.timestamps[i] >= cutoff) {
        activeCount++;
      }
    }
    return activeCount;
  }
}
```

**Sliding Window with Sorted Set (Redis-like approach, in-process):**

```typescript
class SlidingWindowCounter {
  private timestamps: Map<string, number[]> = new Map();

  /**
   * Add a transaction timestamp for a user and return the count
   * within the specified window.
   */
  addAndCount(userId: string, windowMs: number): number {
    const now = Date.now();
    const cutoff = now - windowMs;

    let userTimestamps = this.timestamps.get(userId);
    if (!userTimestamps) {
      userTimestamps = [];
      this.timestamps.set(userId, userTimestamps);
    }

    // Prune expired entries
    const firstValid = userTimestamps.findIndex((ts) => ts >= cutoff);
    if (firstValid > 0) {
      userTimestamps.splice(0, firstValid);
    } else if (firstValid === -1) {
      userTimestamps.length = 0;
    }

    userTimestamps.push(now);
    return userTimestamps.length;
  }

  /**
   * Periodic cleanup to prevent memory leaks from inactive users.
   */
  cleanup(maxIdleMs: number): void {
    const cutoff = Date.now() - maxIdleMs;
    for (const [userId, timestamps] of this.timestamps) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] < cutoff) {
        this.timestamps.delete(userId);
      }
    }
  }
}
```

**Trade-off analysis for our scale (1,000 TPS):**

| Approach | Latency | Consistency | Scalability | Complexity |
|----------|---------|-------------|-------------|------------|
| PostgreSQL query | ~2-5ms | Strong | Multi-instance safe | Low |
| In-memory (single node) | ~0.01ms | Process-local only | Single instance | Medium |
| Redis sorted set | ~0.5-1ms | Shared state | Multi-instance safe | Medium |

**Recommendation for this project**: Use PostgreSQL queries. At 1,000 TPS with proper indexing, the database approach adds only 2-5ms of latency per check, provides consistency across multiple service instances, and requires no additional infrastructure. If latency becomes an issue, upgrade to Redis later.

### 1.4 Configuration

Velocity check parameters should be configurable via environment variables (as already specified in the project):

```typescript
interface VelocityCheckConfig {
  /** Time window in minutes (default: 5) */
  windowMinutes: number;         // FRAUD_VELOCITY_WINDOW_MINUTES
  /** Max transactions allowed in window (default: 10) */
  maxTransactions: number;       // FRAUD_VELOCITY_MAX_TRANSACTIONS
  /** Whether to block or just alert (default: alert) */
  action: 'BLOCK' | 'ALERT';
  /** Apply per-user (default) or globally */
  scope: 'PER_USER' | 'GLOBAL';
}
```

### 1.5 Edge Cases and Considerations

- **Clock skew**: In a multi-instance deployment, ensure all instances use database time (`NOW()`) rather than application time for consistency. Prisma's `createdAt` with `@default(now())` uses the database clock.
- **Timezone handling**: Store all timestamps in UTC. The sliding window calculation is timezone-agnostic since it uses relative time.
- **Transaction status**: Only count transactions that are COMPLETED or PENDING. Failed/rejected transactions should not count toward velocity limits, as they may indicate a legitimate user retrying after an error.
- **Concurrent requests**: Two requests arriving simultaneously could both pass the velocity check before either is committed. Mitigation: use `SELECT ... FOR UPDATE` or accept occasional slight over-threshold as an acceptable trade-off for non-blocking performance.
- **Window boundary precision**: Use `>=` for the window start (inclusive) and let the current time be the implicit end. This avoids off-by-one issues.

---

## 2. Amount Threshold Detection

Amount-based detection identifies transactions that are unusual in their monetary value, either individually or in aggregate.

### 2.1 Single Transaction Threshold

The simplest check: flag any transaction whose amount exceeds a configured threshold.

```typescript
interface AmountThresholdConfig {
  /** Amount above which a transaction triggers an alert */
  singleTransactionThreshold: number;  // FRAUD_AMOUNT_THRESHOLD = 10000
  /** Currency (for multi-currency support) */
  currency: string;
}
```

**Implementation:**

```typescript
function checkSingleAmountThreshold(
  amount: number,
  threshold: number,
): FraudCheckResult {
  if (amount >= threshold) {
    return {
      triggered: true,
      severity: amount >= threshold * 2 ? 'CRITICAL' : 'HIGH',
      reason: `Transaction amount ${amount} exceeds threshold ${threshold}`,
      score: Math.min((amount / threshold) * 50, 100),
    };
  }
  return { triggered: false, severity: 'NONE', reason: '', score: 0 };
}
```

### 2.2 Cumulative Amount Threshold

Flag when the total amount of a user's transactions within a time window exceeds a threshold. This catches structured deposits (smurfing) where individual transactions stay below the single-transaction threshold.

**PostgreSQL query:**

```sql
SELECT COALESCE(SUM(amount), 0) as total_amount
FROM transactions
WHERE user_id = $1
  AND created_at >= NOW() - INTERVAL '24 hours'
  AND status IN ('COMPLETED', 'PENDING')
  AND type = 'DEPOSIT';
```

**Prisma implementation:**

```typescript
async getCumulativeAmount(
  userId: string,
  windowHours: number,
  transactionType?: TransactionType,
): Promise<number> {
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const result = await this.prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      userId,
      createdAt: { gte: windowStart },
      status: { in: ['COMPLETED', 'PENDING'] },
      ...(transactionType && { type: transactionType }),
    },
  });

  return result._sum.amount?.toNumber() ?? 0;
}
```

### 2.3 Percentage-Based Thresholds (Behavioral Deviation)

Compare a transaction amount to the user's historical average. This detects anomalies relative to each user's normal behavior.

```typescript
interface UserAmountProfile {
  averageAmount: number;
  standardDeviation: number;
  maxHistoricalAmount: number;
  transactionCount: number;
}

function checkBehavioralDeviation(
  amount: number,
  profile: UserAmountProfile,
  deviationMultiplier: number = 3, // 3 standard deviations
): FraudCheckResult {
  // Need sufficient history to establish a baseline
  if (profile.transactionCount < 10) {
    return { triggered: false, severity: 'NONE', reason: 'Insufficient history', score: 0 };
  }

  const deviationThreshold =
    profile.averageAmount + deviationMultiplier * profile.standardDeviation;

  if (amount > deviationThreshold) {
    const deviations =
      (amount - profile.averageAmount) / profile.standardDeviation;
    return {
      triggered: true,
      severity: deviations > 5 ? 'CRITICAL' : 'HIGH',
      reason: `Amount ${amount} is ${deviations.toFixed(1)} standard deviations above user average ${profile.averageAmount.toFixed(2)}`,
      score: Math.min(deviations * 15, 100),
    };
  }

  return { triggered: false, severity: 'NONE', reason: '', score: 0 };
}
```

**PostgreSQL query for user profile:**

```sql
SELECT
  AVG(amount) as avg_amount,
  STDDEV(amount) as stddev_amount,
  MAX(amount) as max_amount,
  COUNT(*) as tx_count
FROM transactions
WHERE user_id = $1
  AND status = 'COMPLETED'
  AND created_at >= NOW() - INTERVAL '90 days';
```

### 2.4 Multi-Tier Alerting

Different thresholds trigger different severity levels and actions:

```typescript
interface AmountTier {
  threshold: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  action: 'LOG' | 'ALERT' | 'ALERT_AND_HOLD' | 'BLOCK';
}

const DEFAULT_AMOUNT_TIERS: AmountTier[] = [
  { threshold: 5000,  severity: 'LOW',      action: 'LOG' },
  { threshold: 10000, severity: 'MEDIUM',   action: 'ALERT' },
  { threshold: 25000, severity: 'HIGH',     action: 'ALERT_AND_HOLD' },
  { threshold: 50000, severity: 'CRITICAL', action: 'BLOCK' },
];
```

### 2.5 Configuration-Driven Thresholds

Store thresholds in environment variables or a configuration service so they can be adjusted without redeployment:

```typescript
// In NestJS ConfigModule
export const fraudConfig = registerAs('fraud', () => ({
  amountThreshold: parseInt(process.env.FRAUD_AMOUNT_THRESHOLD ?? '10000', 10),
  cumulativeWindowHours: parseInt(process.env.FRAUD_CUMULATIVE_WINDOW_HOURS ?? '24', 10),
  cumulativeThreshold: parseInt(process.env.FRAUD_CUMULATIVE_THRESHOLD ?? '50000', 10),
  behavioralDeviationMultiplier: parseFloat(
    process.env.FRAUD_BEHAVIORAL_DEVIATION_MULTIPLIER ?? '3',
  ),
}));
```

---

## 3. Pattern Recognition for Suspicious Behavior

Beyond simple thresholds, pattern recognition identifies multi-step fraud schemes that evade single-check detection.

### 3.1 Consecutive High-Amount Transactions

Detect when a user performs multiple high-value transactions in rapid succession.

**Detection logic:**

```typescript
interface ConsecutiveHighAmountConfig {
  /** Minimum amount to qualify as "high" */
  highAmountFloor: number;
  /** Number of consecutive high-amount transactions to trigger */
  consecutiveCount: number;
  /** Time window for consecutiveness */
  windowMinutes: number;
}

async function checkConsecutiveHighAmounts(
  userId: string,
  config: ConsecutiveHighAmountConfig,
  repository: ITransactionRepository,
): Promise<FraudCheckResult> {
  const recentTransactions = await repository.findRecentByUser(
    userId,
    config.windowMinutes,
    config.consecutiveCount + 2, // fetch a few extra for context
  );

  let consecutiveHigh = 0;
  for (const tx of recentTransactions) {
    if (tx.amount >= config.highAmountFloor) {
      consecutiveHigh++;
      if (consecutiveHigh >= config.consecutiveCount) {
        return {
          triggered: true,
          severity: 'HIGH',
          reason: `${consecutiveHigh} consecutive transactions above ${config.highAmountFloor} within ${config.windowMinutes} minutes`,
          score: 70,
        };
      }
    } else {
      consecutiveHigh = 0; // reset on a normal transaction
    }
  }

  return { triggered: false, severity: 'NONE', reason: '', score: 0 };
}
```

### 3.2 Rapid Deposit-Then-Withdraw (Layering / Money Laundering Indicator)

A classic money laundering pattern: deposit funds and rapidly withdraw them, possibly in smaller amounts (structuring). This is one of the most important patterns for a digital wallet.

**Detection approach:**

```typescript
interface DepositWithdrawPattern {
  /** Maximum time between deposit and subsequent withdrawals */
  maxGapMinutes: number;
  /** Minimum percentage of deposited amount withdrawn to trigger */
  withdrawalPercentageThreshold: number; // e.g., 0.8 = 80%
}

async function checkDepositWithdrawPattern(
  userId: string,
  config: DepositWithdrawPattern,
  repository: ITransactionRepository,
): Promise<FraudCheckResult> {
  const windowStart = new Date(
    Date.now() - config.maxGapMinutes * 60 * 1000,
  );

  // Get deposits in window
  const deposits = await repository.findByUserAndType(
    userId,
    'DEPOSIT',
    windowStart,
  );

  if (deposits.length === 0) {
    return { triggered: false, severity: 'NONE', reason: '', score: 0 };
  }

  const totalDeposited = deposits.reduce((sum, tx) => sum + tx.amount, 0);

  // Get withdrawals after the first deposit
  const firstDepositTime = deposits[0].createdAt;
  const withdrawals = await repository.findByUserAndTypeAfter(
    userId,
    'WITHDRAWAL',
    firstDepositTime,
  );

  const totalWithdrawn = withdrawals.reduce((sum, tx) => sum + tx.amount, 0);
  const withdrawalRatio = totalWithdrawn / totalDeposited;

  if (withdrawalRatio >= config.withdrawalPercentageThreshold) {
    return {
      triggered: true,
      severity: 'CRITICAL',
      reason: `Rapid deposit-withdraw detected: deposited ${totalDeposited}, withdrew ${totalWithdrawn} (${(withdrawalRatio * 100).toFixed(0)}%) within ${config.maxGapMinutes} minutes`,
      score: 90,
    };
  }

  return { triggered: false, severity: 'NONE', reason: '', score: 0 };
}
```

### 3.3 Unusual Transaction Timing

Flag transactions occurring outside of a user's typical activity hours.

```typescript
function checkUnusualTiming(
  transactionHourUtc: number,
  userTimezone: string,
  unusualHoursStart: number = 1,  // 1 AM local
  unusualHoursEnd: number = 5,    // 5 AM local
): FraudCheckResult {
  // Convert UTC hour to user's local hour
  const localHour = convertToLocalHour(transactionHourUtc, userTimezone);

  if (localHour >= unusualHoursStart && localHour < unusualHoursEnd) {
    return {
      triggered: true,
      severity: 'LOW',
      reason: `Transaction at unusual hour: ${localHour}:00 local time`,
      score: 20,
    };
  }

  return { triggered: false, severity: 'NONE', reason: '', score: 0 };
}
```

**Note**: This is a weak signal on its own and should only be used to increase a composite fraud score, never as a standalone trigger.

### 3.4 Geographic Anomalies

If the system captures IP addresses or device location:
- **Impossible travel**: Two transactions from locations that are geographically impossible to reach in the elapsed time
- **New location**: Transaction from a location the user has never transacted from before
- **High-risk regions**: Transactions originating from regions known for elevated fraud rates

**Feasibility for this project**: Low priority. Geographic checks require location data collection (IP geolocation, device GPS) which adds significant complexity. Consider as a future enhancement if the API layer captures client IP addresses.

### 3.5 Statistical Deviation from Normal Behavior

Build a per-user behavioral profile and flag transactions that deviate significantly:

- **Amount deviation**: Covered in Section 2.3
- **Frequency deviation**: User normally transacts 2-3 times per day but suddenly submits 20 transactions
- **Type deviation**: User normally only deposits but suddenly begins heavy withdrawals
- **Recipient deviation**: User normally transacts with 2-3 counterparties but suddenly sends to 10 new recipients

**Implementation approach for frequency deviation:**

```sql
-- User's average daily transaction count (last 30 days)
WITH daily_counts AS (
  SELECT DATE(created_at) as tx_date, COUNT(*) as daily_count
  FROM transactions
  WHERE user_id = $1
    AND created_at >= NOW() - INTERVAL '30 days'
    AND status = 'COMPLETED'
  GROUP BY DATE(created_at)
)
SELECT
  AVG(daily_count) as avg_daily,
  STDDEV(daily_count) as stddev_daily
FROM daily_counts;
```

### 3.6 Feasibility Assessment for Project Scope

| Pattern | Implementation Effort | Detection Value | Priority |
|---------|----------------------|-----------------|----------|
| Velocity check | Low | High | **P0 - Must have** |
| Single amount threshold | Low | High | **P0 - Must have** |
| Cumulative amount | Low-Medium | High | **P1 - Should have** |
| Deposit-then-withdraw | Medium | Very High | **P1 - Should have** |
| Consecutive high amounts | Low | Medium | **P2 - Nice to have** |
| Behavioral deviation | Medium | Medium | **P2 - Nice to have** |
| Unusual timing | Low | Low | **P3 - Future** |
| Geographic anomalies | High | High | **P3 - Future** |

---

## 4. Configurable Rule Engine Design

A well-designed rule engine allows adding new fraud detection rules without modifying existing code. This is critical for a fraud system that must evolve rapidly in response to new attack vectors.

### 4.1 Strategy Pattern for Fraud Rules

The Strategy pattern is ideal here: each fraud check is a strategy that can be evaluated independently and composed into a pipeline.

**Core interfaces:**

```typescript
// domain/interfaces/fraud-rule.interface.ts

/**
 * Severity levels for fraud alerts.
 */
export type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Result of evaluating a single fraud rule.
 */
export interface FraudCheckResult {
  /** Whether this rule was triggered */
  triggered: boolean;
  /** Severity level if triggered */
  severity: FraudSeverity;
  /** Human-readable explanation */
  reason: string;
  /** Numeric risk score (0-100) for weighted composition */
  score: number;
  /** Identifier of the rule that produced this result */
  ruleName?: string;
  /** Additional metadata for debugging/auditing */
  metadata?: Record<string, unknown>;
}

/**
 * Context passed to every fraud rule for evaluation.
 * Contains the transaction under review and access to historical data.
 */
export interface FraudEvaluationContext {
  /** The transaction being evaluated */
  transaction: {
    id: string;
    userId: string;
    type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
    amount: number;
    currency: string;
    createdAt: Date;
    metadata?: Record<string, unknown>;
  };
  /** Access to historical transaction data */
  transactionHistory: {
    countInWindow(userId: string, windowMinutes: number): Promise<number>;
    sumInWindow(userId: string, windowMinutes: number, type?: string): Promise<number>;
    getRecent(userId: string, limit: number): Promise<Array<{ amount: number; type: string; createdAt: Date }>>;
    getUserProfile(userId: string): Promise<{
      averageAmount: number;
      standardDeviation: number;
      transactionCount: number;
    }>;
  };
}

/**
 * Port interface for a fraud detection rule.
 * Every rule implements this interface.
 */
export interface IFraudRule {
  /** Unique name for this rule */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Whether this rule is currently enabled */
  readonly enabled: boolean;
  /**
   * Evaluate the rule against a transaction context.
   * Must be stateless and side-effect free.
   */
  evaluate(context: FraudEvaluationContext): Promise<FraudCheckResult>;
}
```

### 4.2 Concrete Rule Implementations

**Velocity Check Rule:**

```typescript
// domain/services/fraud-rules/velocity-check.rule.ts

export class VelocityCheckRule implements IFraudRule {
  readonly name = 'velocity-check';
  readonly description = 'Checks transaction frequency within a time window';
  readonly enabled: boolean;

  constructor(
    private readonly config: {
      windowMinutes: number;
      maxTransactions: number;
      enabled?: boolean;
    },
  ) {
    this.enabled = config.enabled ?? true;
  }

  async evaluate(context: FraudEvaluationContext): Promise<FraudCheckResult> {
    const count = await context.transactionHistory.countInWindow(
      context.transaction.userId,
      this.config.windowMinutes,
    );

    if (count >= this.config.maxTransactions) {
      const overageRatio = count / this.config.maxTransactions;
      return {
        triggered: true,
        severity: overageRatio > 2 ? 'CRITICAL' : 'HIGH',
        reason: `${count} transactions in ${this.config.windowMinutes} minutes (limit: ${this.config.maxTransactions})`,
        score: Math.min(overageRatio * 40, 100),
        ruleName: this.name,
        metadata: { count, windowMinutes: this.config.windowMinutes },
      };
    }

    return {
      triggered: false,
      severity: 'LOW',
      reason: '',
      score: 0,
      ruleName: this.name,
    };
  }
}
```

**Amount Threshold Rule:**

```typescript
// domain/services/fraud-rules/amount-threshold.rule.ts

export class AmountThresholdRule implements IFraudRule {
  readonly name = 'amount-threshold';
  readonly description = 'Flags transactions exceeding configured amount threshold';
  readonly enabled: boolean;

  constructor(
    private readonly config: {
      threshold: number;
      enabled?: boolean;
    },
  ) {
    this.enabled = config.enabled ?? true;
  }

  async evaluate(context: FraudEvaluationContext): Promise<FraudCheckResult> {
    const { amount } = context.transaction;

    if (amount >= this.config.threshold) {
      const ratio = amount / this.config.threshold;
      return {
        triggered: true,
        severity: ratio >= 5 ? 'CRITICAL' : ratio >= 2 ? 'HIGH' : 'MEDIUM',
        reason: `Transaction amount ${amount} exceeds threshold ${this.config.threshold}`,
        score: Math.min(ratio * 30, 100),
        ruleName: this.name,
        metadata: { amount, threshold: this.config.threshold },
      };
    }

    return {
      triggered: false,
      severity: 'LOW',
      reason: '',
      score: 0,
      ruleName: this.name,
    };
  }
}
```

### 4.3 Composable Rules (AND, OR, Weighted Scoring)

Rules should compose together to create sophisticated detection logic:

```typescript
// domain/services/fraud-rules/composite-rules.ts

/**
 * Combines multiple rules with AND logic.
 * Triggers only if ALL child rules trigger.
 */
export class AndCompositeRule implements IFraudRule {
  readonly name: string;
  readonly description: string;
  readonly enabled = true;

  constructor(
    name: string,
    description: string,
    private readonly rules: IFraudRule[],
  ) {
    this.name = name;
    this.description = description;
  }

  async evaluate(context: FraudEvaluationContext): Promise<FraudCheckResult> {
    const results = await Promise.all(
      this.rules
        .filter((r) => r.enabled)
        .map((r) => r.evaluate(context)),
    );

    const allTriggered = results.every((r) => r.triggered);

    if (allTriggered) {
      const maxSeverity = this.getMaxSeverity(results);
      const avgScore =
        results.reduce((sum, r) => sum + r.score, 0) / results.length;

      return {
        triggered: true,
        severity: maxSeverity,
        reason: `All conditions met: ${results.map((r) => r.reason).join('; ')}`,
        score: avgScore,
        ruleName: this.name,
        metadata: { childResults: results },
      };
    }

    return { triggered: false, severity: 'LOW', reason: '', score: 0, ruleName: this.name };
  }

  private getMaxSeverity(results: FraudCheckResult[]): FraudSeverity {
    const order: FraudSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    let max = 0;
    for (const r of results) {
      const idx = order.indexOf(r.severity);
      if (idx > max) max = idx;
    }
    return order[max];
  }
}

/**
 * Combines multiple rules with OR logic.
 * Triggers if ANY child rule triggers.
 */
export class OrCompositeRule implements IFraudRule {
  readonly name: string;
  readonly description: string;
  readonly enabled = true;

  constructor(
    name: string,
    description: string,
    private readonly rules: IFraudRule[],
  ) {
    this.name = name;
    this.description = description;
  }

  async evaluate(context: FraudEvaluationContext): Promise<FraudCheckResult> {
    const results = await Promise.all(
      this.rules
        .filter((r) => r.enabled)
        .map((r) => r.evaluate(context)),
    );

    const triggeredResults = results.filter((r) => r.triggered);

    if (triggeredResults.length > 0) {
      const maxSeverity = this.getMaxSeverity(triggeredResults);
      const maxScore = Math.max(...triggeredResults.map((r) => r.score));

      return {
        triggered: true,
        severity: maxSeverity,
        reason: triggeredResults.map((r) => r.reason).join('; '),
        score: maxScore,
        ruleName: this.name,
        metadata: { triggeredRules: triggeredResults.map((r) => r.ruleName) },
      };
    }

    return { triggered: false, severity: 'LOW', reason: '', score: 0, ruleName: this.name };
  }

  private getMaxSeverity(results: FraudCheckResult[]): FraudSeverity {
    const order: FraudSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    let max = 0;
    for (const r of results) {
      const idx = order.indexOf(r.severity);
      if (idx > max) max = idx;
    }
    return order[max];
  }
}

/**
 * Weighted scoring rule: assigns weights to each child rule's score
 * and triggers if the combined weighted score exceeds a threshold.
 */
export class WeightedScoringRule implements IFraudRule {
  readonly name: string;
  readonly description: string;
  readonly enabled = true;

  constructor(
    name: string,
    description: string,
    private readonly weightedRules: Array<{ rule: IFraudRule; weight: number }>,
    private readonly scoreThreshold: number = 50,
  ) {
    this.name = name;
    this.description = description;
  }

  async evaluate(context: FraudEvaluationContext): Promise<FraudCheckResult> {
    const results = await Promise.all(
      this.weightedRules
        .filter((wr) => wr.rule.enabled)
        .map(async (wr) => ({
          result: await wr.rule.evaluate(context),
          weight: wr.weight,
        })),
    );

    const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
    const weightedScore = results.reduce(
      (sum, r) => sum + r.result.score * (r.weight / totalWeight),
      0,
    );

    if (weightedScore >= this.scoreThreshold) {
      return {
        triggered: true,
        severity: this.scoreToSeverity(weightedScore),
        reason: `Weighted fraud score ${weightedScore.toFixed(1)} exceeds threshold ${this.scoreThreshold}`,
        score: weightedScore,
        ruleName: this.name,
        metadata: {
          weightedScore,
          contributions: results.map((r) => ({
            rule: r.result.ruleName,
            score: r.result.score,
            weight: r.weight,
            contribution: r.result.score * (r.weight / totalWeight),
          })),
        },
      };
    }

    return {
      triggered: false,
      severity: 'LOW',
      reason: '',
      score: weightedScore,
      ruleName: this.name,
    };
  }

  private scoreToSeverity(score: number): FraudSeverity {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }
}
```

### 4.4 Domain Service for Fraud Analysis

The fraud analysis domain service orchestrates all rules:

```typescript
// domain/services/fraud-analysis.service.ts

export interface FraudAnalysisResult {
  /** Whether any rule was triggered */
  isFraudulent: boolean;
  /** Overall risk score (0-100) */
  riskScore: number;
  /** Highest severity across all triggered rules */
  maxSeverity: FraudSeverity;
  /** Results from each individual rule */
  ruleResults: FraudCheckResult[];
  /** Recommended action */
  recommendedAction: 'ALLOW' | 'ALERT' | 'HOLD' | 'BLOCK';
  /** Timestamp of analysis */
  analyzedAt: Date;
}

export class FraudAnalysisService {
  constructor(private readonly rules: IFraudRule[]) {}

  /**
   * Analyze a transaction against all enabled fraud rules.
   * Returns a comprehensive fraud analysis result.
   */
  async analyze(
    context: FraudEvaluationContext,
  ): Promise<FraudAnalysisResult> {
    const enabledRules = this.rules.filter((r) => r.enabled);

    const ruleResults = await Promise.all(
      enabledRules.map((rule) => rule.evaluate(context)),
    );

    const triggeredResults = ruleResults.filter((r) => r.triggered);
    const isFraudulent = triggeredResults.length > 0;
    const riskScore = this.calculateOverallScore(ruleResults);
    const maxSeverity = this.getMaxSeverity(triggeredResults);

    return {
      isFraudulent,
      riskScore,
      maxSeverity: isFraudulent ? maxSeverity : 'LOW',
      ruleResults,
      recommendedAction: this.determineAction(riskScore, maxSeverity),
      analyzedAt: new Date(),
    };
  }

  private calculateOverallScore(results: FraudCheckResult[]): number {
    if (results.length === 0) return 0;
    // Use the maximum score among all rules
    // This ensures a single high-confidence detection is not diluted
    return Math.max(...results.map((r) => r.score));
  }

  private getMaxSeverity(results: FraudCheckResult[]): FraudSeverity {
    const order: FraudSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    let max = 0;
    for (const r of results) {
      const idx = order.indexOf(r.severity);
      if (idx > max) max = idx;
    }
    return order[max];
  }

  private determineAction(
    score: number,
    severity: FraudSeverity,
  ): 'ALLOW' | 'ALERT' | 'HOLD' | 'BLOCK' {
    if (severity === 'CRITICAL' || score >= 80) return 'BLOCK';
    if (severity === 'HIGH' || score >= 60) return 'HOLD';
    if (severity === 'MEDIUM' || score >= 30) return 'ALERT';
    return 'ALLOW';
  }
}
```

### 4.5 Adding New Rules Without Code Changes

The rule engine supports two strategies for extensibility:

**Strategy A: Configuration-driven rules (recommended for this project)**

Define rules in a factory that reads from configuration:

```typescript
// application/services/fraud-rule.factory.ts

@Injectable()
export class FraudRuleFactory {
  constructor(
    @Inject('FRAUD_CONFIG') private readonly config: FraudConfig,
  ) {}

  /**
   * Create all fraud rules from configuration.
   * New rules are added here and enabled/disabled via config.
   */
  createRules(): IFraudRule[] {
    const rules: IFraudRule[] = [];

    if (this.config.velocityCheckEnabled) {
      rules.push(
        new VelocityCheckRule({
          windowMinutes: this.config.velocityWindowMinutes,
          maxTransactions: this.config.velocityMaxTransactions,
        }),
      );
    }

    if (this.config.amountThresholdEnabled) {
      rules.push(
        new AmountThresholdRule({
          threshold: this.config.amountThreshold,
        }),
      );
    }

    // Add more rules as needed...

    return rules;
  }
}
```

**Strategy B: Plugin-based rules (future enhancement)**

Use NestJS module system to discover rules automatically:

```typescript
// Each rule module exports a provider with a specific token
@Module({
  providers: [
    {
      provide: 'FRAUD_RULE',
      useClass: VelocityCheckRule,
    },
  ],
  exports: ['FRAUD_RULE'],
})
export class VelocityCheckModule {}

// Fraud analysis module collects all rules
@Module({
  imports: [VelocityCheckModule, AmountThresholdModule /* ... */],
})
export class FraudAnalysisModule {
  constructor(
    @InjectAll('FRAUD_RULE') private readonly rules: IFraudRule[],
  ) {}
}
```

---

## 5. Real-Time vs Batch Detection Tradeoffs

Fraud detection timing fundamentally impacts both effectiveness and system architecture. The right approach depends on the type of fraud being detected and the acceptable latency.

### 5.1 Real-Time (Synchronous) Detection

**How it works**: Fraud checks execute as part of the transaction processing pipeline, before the transaction is committed. The transaction is blocked or flagged before completion.

```
User Request → Controller → Use Case → [Fraud Check] → Execute Transaction → Response
```

**Pros:**
- Immediate prevention: Fraudulent transactions are stopped before they complete
- Better user experience: Users get immediate feedback if a transaction is blocked
- Simpler mental model: All processing happens in one request/response cycle
- Strong consistency: No window where fraud can complete before detection

**Cons:**
- Adds latency to every transaction (2-10ms per check, depending on complexity)
- Complex checks can create timeouts or degraded user experience
- Must handle failure gracefully (what if the fraud check service is down?)
- Limits the complexity of rules that can run synchronously

**Suitable for:**
- Velocity checks (fast database query)
- Single amount threshold (in-memory comparison)
- Account status checks (frozen, suspended)
- Blocklist/allowlist checks

**Performance budget at 1,000 TPS:**
- Target: < 10ms total for all synchronous fraud checks
- Velocity check via PostgreSQL: ~2-5ms
- Amount threshold (in-memory): ~0.01ms
- Total overhead: ~5ms (acceptable)

### 5.2 Near-Real-Time (Asynchronous) Detection

**How it works**: The transaction completes immediately. An event is emitted (via EventEmitter or a message queue), and fraud analysis runs asynchronously. If fraud is detected, the transaction is flagged, held, or reversed.

```
User Request → Controller → Use Case → Execute Transaction → Emit Event → Response
                                                                    ↓
                                                              [Async Fraud Analysis]
                                                                    ↓
                                                              Create Alert / Hold Transaction
```

**NestJS EventEmitter implementation:**

```typescript
// In the transaction use case, after successful transaction:
this.eventEmitter.emit('transaction.completed', {
  transactionId: transaction.id,
  userId: transaction.userId,
  amount: transaction.amount,
  type: transaction.type,
  createdAt: transaction.createdAt,
});

// Fraud listener:
@OnEvent('transaction.completed')
async handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
  const context = await this.buildFraudContext(event);
  const result = await this.fraudAnalysisService.analyze(context);

  if (result.isFraudulent) {
    await this.fraudAlertService.createAlert({
      userId: event.userId,
      transactionId: event.transactionId,
      severity: result.maxSeverity,
      ruleResults: result.ruleResults,
      riskScore: result.riskScore,
    });

    if (result.recommendedAction === 'HOLD' || result.recommendedAction === 'BLOCK') {
      await this.transactionService.holdTransaction(event.transactionId);
    }
  }
}
```

**Pros:**
- Zero latency impact on transaction processing
- Can run more complex analysis (pattern matching, statistical models)
- Failure in fraud detection does not break transaction processing
- Can process events in parallel, scaling independently

**Cons:**
- Fraud may complete before detection (a fraudulent transaction processes and funds move)
- Requires a reversal/hold mechanism for already-processed transactions
- More complex architecture (event handling, retry logic)
- Eventual consistency between transaction state and fraud state

**Suitable for:**
- Pattern recognition (deposit-then-withdraw)
- Behavioral deviation analysis
- Cross-user correlation
- Complex multi-rule analysis

### 5.3 Batch (Periodic) Detection

**How it works**: A scheduled job (cron) analyzes transaction history periodically, looking for patterns that are only visible across many transactions.

```typescript
// Using NestJS @Cron decorator
@Cron('0 */15 * * * *') // Every 15 minutes
async runBatchFraudAnalysis(): Promise<void> {
  const windowStart = new Date(Date.now() - 15 * 60 * 1000);

  // Find users with suspicious patterns in the last window
  const suspiciousUsers = await this.repository.findUsersWithHighActivity(
    windowStart,
    thresholds,
  );

  for (const userId of suspiciousUsers) {
    const analysis = await this.deepAnalysis(userId);
    if (analysis.isSuspicious) {
      await this.createBatchAlert(userId, analysis);
    }
  }
}
```

**Pros:**
- Can use computationally expensive algorithms without impacting production
- Analyzes aggregate patterns across many transactions and users
- No production latency impact
- Good for trend analysis, model training, and reporting

**Cons:**
- Delayed detection (up to one batch interval)
- Fraudulent transactions may have already been completed and funds withdrawn
- Requires careful scheduling to avoid database contention

**Suitable for:**
- Trend analysis (detecting slowly evolving fraud patterns)
- Ring detection (groups of users defrauding the system together)
- Statistical model training and tuning
- Compliance reporting

### 5.4 Recommended Hybrid Approach for This Project

```
┌─────────────────────────────────────────────────────────────────┐
│                    Transaction Processing                        │
│                                                                  │
│  Request ─→ [Sync Checks] ─→ Process Transaction ─→ Response   │
│              │                       │                           │
│              │ Velocity Check        │ Emit Event                │
│              │ Amount Threshold      ↓                           │
│              │                 [Async Analysis]                   │
│              │                  │                                 │
│              │                  │ Pattern Detection               │
│              │                  │ Behavioral Analysis             │
│              │                  │ Deposit-Withdraw Check          │
│              │                  ↓                                 │
│              │            Create Alert / Hold                     │
│              │                                                    │
│              └── Block if CRITICAL ──→ Reject Transaction        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Batch Processing (Every 15min)               │
│                                                                  │
│  Cron ─→ Aggregate Analysis ─→ Trend Detection ─→ Reports      │
└─────────────────────────────────────────────────────────────────┘
```

**Layer assignment:**

| Detection Type | Timing | Latency Budget | Implementation |
|---------------|--------|----------------|----------------|
| Velocity check | Synchronous | 5ms | Domain service, DB query |
| Amount threshold | Synchronous | 0.1ms | Domain service, in-memory |
| Deposit-withdraw pattern | Asynchronous | N/A | EventEmitter listener |
| Consecutive high amounts | Asynchronous | N/A | EventEmitter listener |
| Behavioral deviation | Asynchronous | N/A | EventEmitter listener |
| Trend analysis | Batch (15min) | N/A | NestJS @Cron |

---

## 6. Alert Management

Fraud alerts are the output of the detection system. They must be tracked, investigated, and resolved.

### 6.1 FraudAlert Entity Design

```typescript
// domain/entities/fraud-alert.entity.ts

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';

export interface FraudAlertProps {
  id: string;
  userId: string;
  transactionId?: string;
  severity: AlertSeverity;
  status: AlertStatus;
  riskScore: number;
  /** Which rules triggered this alert */
  triggeredRules: string[];
  /** Detailed results from each rule */
  ruleResults: FraudCheckResult[];
  /** Human-readable description */
  description: string;
  /** When the alert was created */
  createdAt: Date;
  /** When the alert was last updated */
  updatedAt: Date;
  /** Who resolved/dismissed the alert */
  resolvedBy?: string;
  /** Resolution notes */
  resolutionNotes?: string;
  /** When the alert was resolved */
  resolvedAt?: Date;
  /** Additional context */
  metadata?: Record<string, unknown>;
}

export class FraudAlert {
  private props: FraudAlertProps;

  private constructor(props: FraudAlertProps) {
    this.props = { ...props };
  }

  /**
   * Create a new fraud alert from an analysis result.
   */
  static create(params: {
    id: string;
    userId: string;
    transactionId?: string;
    analysisResult: FraudAnalysisResult;
  }): FraudAlert {
    const triggeredResults = params.analysisResult.ruleResults.filter(
      (r) => r.triggered,
    );

    return new FraudAlert({
      id: params.id,
      userId: params.userId,
      transactionId: params.transactionId,
      severity: params.analysisResult.maxSeverity,
      status: 'OPEN',
      riskScore: params.analysisResult.riskScore,
      triggeredRules: triggeredResults.map((r) => r.ruleName ?? 'unknown'),
      ruleResults: triggeredResults,
      description: triggeredResults.map((r) => r.reason).join('. '),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // --- Getters ---

  get id(): string { return this.props.id; }
  get userId(): string { return this.props.userId; }
  get transactionId(): string | undefined { return this.props.transactionId; }
  get severity(): AlertSeverity { return this.props.severity; }
  get status(): AlertStatus { return this.props.status; }
  get riskScore(): number { return this.props.riskScore; }
  get triggeredRules(): string[] { return [...this.props.triggeredRules]; }
  get description(): string { return this.props.description; }
  get createdAt(): Date { return this.props.createdAt; }
  get resolvedAt(): Date | undefined { return this.props.resolvedAt; }

  // --- State Transitions ---

  /**
   * Acknowledge the alert (someone is looking at it).
   */
  acknowledge(): void {
    this.assertStatus(['OPEN']);
    this.props.status = 'ACKNOWLEDGED';
    this.props.updatedAt = new Date();
  }

  /**
   * Mark the alert as under investigation.
   */
  startInvestigation(): void {
    this.assertStatus(['OPEN', 'ACKNOWLEDGED']);
    this.props.status = 'INVESTIGATING';
    this.props.updatedAt = new Date();
  }

  /**
   * Resolve the alert (confirmed fraud or action taken).
   */
  resolve(resolvedBy: string, notes: string): void {
    this.assertStatus(['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING']);
    this.props.status = 'RESOLVED';
    this.props.resolvedBy = resolvedBy;
    this.props.resolutionNotes = notes;
    this.props.resolvedAt = new Date();
    this.props.updatedAt = new Date();
  }

  /**
   * Dismiss the alert (false positive).
   */
  dismiss(dismissedBy: string, notes: string): void {
    this.assertStatus(['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING']);
    this.props.status = 'DISMISSED';
    this.props.resolvedBy = dismissedBy;
    this.props.resolutionNotes = notes;
    this.props.resolvedAt = new Date();
    this.props.updatedAt = new Date();
  }

  /**
   * Escalate the alert to a higher severity.
   */
  escalate(newSeverity: AlertSeverity, reason: string): void {
    const order: AlertSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const currentIdx = order.indexOf(this.props.severity);
    const newIdx = order.indexOf(newSeverity);

    if (newIdx <= currentIdx) {
      throw new Error(
        `Cannot escalate from ${this.props.severity} to ${newSeverity}`,
      );
    }

    this.props.severity = newSeverity;
    this.props.description += `. Escalated: ${reason}`;
    this.props.updatedAt = new Date();
  }

  private assertStatus(allowedStatuses: AlertStatus[]): void {
    if (!allowedStatuses.includes(this.props.status)) {
      throw new Error(
        `Cannot transition from status '${this.props.status}'. Allowed: ${allowedStatuses.join(', ')}`,
      );
    }
  }

  /**
   * Convert to a plain object for persistence.
   */
  toProps(): Readonly<FraudAlertProps> {
    return { ...this.props };
  }
}
```

### 6.2 Alert Lifecycle

```
                          ┌─────────────────┐
                          │     OPEN         │
                          │  (auto-created)  │
                          └───────┬──────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    │             │               │
                    ▼             ▼               ▼
           ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
           │ ACKNOWLEDGED │ │ INVESTIGATING│ │  RESOLVED    │
           │ (someone saw)│ │ (digging in) │ │ (confirmed)  │
           └──────┬───────┘ └──────┬───────┘ └──────────────┘
                  │                │
                  ▼                ▼
           ┌──────────────┐ ┌──────────────┐
           │ INVESTIGATING│ │  RESOLVED    │
           └──────┬───────┘ └──────────────┘
                  │
         ┌───────┼────────┐
         ▼                ▼
  ┌──────────────┐ ┌──────────────┐
  │  RESOLVED    │ │  DISMISSED   │
  │ (confirmed)  │ │ (false pos.) │
  └──────────────┘ └──────────────┘
```

**Key design decisions:**
- Alerts can be resolved directly from OPEN (for obvious cases)
- DISMISSED is separate from RESOLVED to track false positive rates
- Every state transition records who and when
- Resolution notes are mandatory for audit trail

### 6.3 Resolution Workflow

The API endpoints defined in the project spec support this workflow:

```
GET  /api/v1/fraud/alerts           → List all open alerts (filterable by severity/status)
GET  /api/v1/fraud/alerts/:userId   → Get alerts for a specific user
PUT  /api/v1/fraud/alerts/:id/resolve → Resolve or dismiss an alert
```

**Resolve request body:**

```typescript
interface ResolveAlertDto {
  /** Resolution action */
  action: 'RESOLVE' | 'DISMISS';
  /** Who is resolving (in production: from auth token) */
  resolvedBy: string;
  /** Explanation of the resolution */
  notes: string;
}
```

### 6.4 Alert Aggregation

When multiple rules trigger for the same user in a short time span, they should be aggregated into a single alert to avoid alert fatigue.

**Aggregation strategy:**

```typescript
async createOrAggregateAlert(
  userId: string,
  transactionId: string,
  analysisResult: FraudAnalysisResult,
): Promise<FraudAlert> {
  // Check for existing open alert for this user within the aggregation window
  const existingAlert = await this.alertRepository.findRecentOpenByUser(
    userId,
    AGGREGATION_WINDOW_MINUTES, // e.g., 30 minutes
  );

  if (existingAlert) {
    // Aggregate: escalate severity if new detection is worse
    if (
      this.severityRank(analysisResult.maxSeverity) >
      this.severityRank(existingAlert.severity)
    ) {
      existingAlert.escalate(
        analysisResult.maxSeverity,
        `Additional detection: ${analysisResult.ruleResults
          .filter((r) => r.triggered)
          .map((r) => r.reason)
          .join('; ')}`,
      );
    }

    await this.alertRepository.save(existingAlert);
    return existingAlert;
  }

  // Create new alert
  const alert = FraudAlert.create({
    id: generateId(),
    userId,
    transactionId,
    analysisResult,
  });

  await this.alertRepository.save(alert);
  return alert;
}
```

### 6.5 Prisma Schema for Fraud Alerts

```prisma
model FraudAlert {
  id              String   @id @default(uuid())
  userId          String   @map("user_id")
  transactionId   String?  @map("transaction_id")
  severity        String   // LOW, MEDIUM, HIGH, CRITICAL
  status          String   @default("OPEN") // OPEN, ACKNOWLEDGED, INVESTIGATING, RESOLVED, DISMISSED
  riskScore       Float    @map("risk_score")
  triggeredRules  String[] @map("triggered_rules")
  description     String
  resolvedBy      String?  @map("resolved_by")
  resolutionNotes String?  @map("resolution_notes")
  resolvedAt      DateTime? @map("resolved_at")
  metadata        Json?
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@index([userId, status])
  @@index([status, severity])
  @@index([createdAt])
  @@map("fraud_alerts")
}
```

---

## 7. Recommendations for This Project

### 7.1 Detection Methods to Implement

Given the scope of a senior engineer assessment, the following tiered approach balances thoroughness with feasibility:

**Tier 1 -- Must Implement (Core Fraud Detection):**

| Method | Timing | Rationale |
|--------|--------|-----------|
| Velocity check | Synchronous | Already spec'd in env vars. Simple, high-value detection. |
| Single amount threshold | Synchronous | Already spec'd in env vars. Trivial to implement. |
| Fraud alert management | N/A | Required by API spec. Shows domain modeling skill. |

**Tier 2 -- Should Implement (Demonstrates Architecture Skill):**

| Method | Timing | Rationale |
|--------|--------|-----------|
| Rule engine with strategy pattern | N/A | Shows clean architecture and extensibility. |
| Cumulative amount threshold | Synchronous | Extends amount check, catches structuring. |
| Deposit-then-withdraw detection | Asynchronous | Classic fraud pattern, shows async event handling. |

**Tier 3 -- Nice to Have (If Time Permits):**

| Method | Timing | Rationale |
|--------|--------|-----------|
| Behavioral deviation | Asynchronous | Shows statistical thinking. |
| Weighted scoring composition | N/A | Shows advanced rule composition. |
| Batch trend analysis | Batch | Shows scheduled processing. |

### 7.2 Domain Model Design

The fraud detection domain model integrates with the existing transaction domain:

```
┌─────────────────────────────────────────────────────────────┐
│                      Domain Layer                            │
│                                                              │
│  ┌──────────────────┐     ┌──────────────────────────────┐  │
│  │ Transaction       │     │ FraudAlert                    │  │
│  │ Entity            │────→│ Entity                        │  │
│  └──────────────────┘     └──────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Fraud Rules (IFraudRule implementations)              │   │
│  │                                                       │   │
│  │  VelocityCheckRule                                    │   │
│  │  AmountThresholdRule                                  │   │
│  │  DepositWithdrawRule                                  │   │
│  │  ...                                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ FraudAnalysisService (Domain Service)                 │   │
│  │                                                       │   │
│  │  - Orchestrates rules                                 │   │
│  │  - Calculates risk score                              │   │
│  │  - Determines recommended action                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────┐     ┌──────────────────────────────┐  │
│  │ IFraudAlert       │     │ ITransactionRepository       │  │
│  │ Repository (Port) │     │ (Port - extended)            │  │
│  └──────────────────┘     └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**File structure:**

```
src/domain/
├── entities/
│   ├── transaction.entity.ts
│   └── fraud-alert.entity.ts
├── interfaces/
│   ├── transaction-repository.interface.ts
│   ├── fraud-alert-repository.interface.ts
│   └── fraud-rule.interface.ts
├── services/
│   ├── fraud-analysis.service.ts
│   └── fraud-rules/
│       ├── velocity-check.rule.ts
│       ├── amount-threshold.rule.ts
│       └── deposit-withdraw.rule.ts
└── events/
    └── transaction-completed.event.ts
```

### 7.3 Integration Points with Transaction Processing

The fraud detection system integrates at two key points in the transaction flow:

**Point 1: Pre-transaction (synchronous)**

```typescript
// application/use-cases/process-transaction.use-case.ts

async execute(dto: ProcessTransactionDto): Promise<TransactionResult> {
  // 1. Build fraud evaluation context
  const fraudContext = await this.buildFraudContext(dto);

  // 2. Run synchronous fraud checks (velocity + amount threshold)
  const fraudResult = await this.fraudAnalysisService.analyze(fraudContext);

  // 3. Block if critical
  if (fraudResult.recommendedAction === 'BLOCK') {
    await this.createFraudAlert(dto.userId, fraudResult);
    throw new TransactionBlockedException(
      'Transaction blocked due to fraud detection',
      fraudResult,
    );
  }

  // 4. Process the transaction
  const transaction = await this.transactionRepository.create(dto);

  // 5. If suspicious but not blocked, create alert and continue
  if (fraudResult.isFraudulent) {
    await this.createFraudAlert(dto.userId, fraudResult, transaction.id);
  }

  // 6. Emit event for async analysis
  this.eventEmitter.emit('transaction.completed', {
    transactionId: transaction.id,
    userId: dto.userId,
    amount: dto.amount,
    type: dto.type,
  });

  return transaction;
}
```

**Point 2: Post-transaction (asynchronous)**

```typescript
// application/listeners/fraud-analysis.listener.ts

@OnEvent('transaction.completed')
async onTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
  // Run async fraud rules (pattern detection, behavioral analysis)
  const context = await this.buildAsyncFraudContext(event);
  const result = await this.asyncFraudAnalysisService.analyze(context);

  if (result.isFraudulent) {
    await this.alertService.createOrAggregateAlert(
      event.userId,
      event.transactionId,
      result,
    );

    if (result.recommendedAction === 'HOLD') {
      await this.transactionService.holdTransaction(event.transactionId);
    }
  }
}
```

### 7.4 Performance Considerations at 1,000 TPS

**Database performance:**

| Operation | Expected Latency | Impact at 1,000 TPS |
|-----------|------------------|----------------------|
| Velocity count query (indexed) | 2-5ms | ~2,000-5,000 queries/s; manageable for PostgreSQL |
| Cumulative sum query (indexed) | 3-7ms | Similar to velocity; use connection pooling |
| User profile query (90-day window) | 10-30ms | Only for async path; cache results for 5 minutes |

**Optimization strategies:**

1. **Index design**: Partial indexes on `(user_id, created_at)` with status filter reduce scan size significantly.

2. **Connection pooling**: Use Prisma's built-in connection pool (default 5 connections). At 1,000 TPS with ~5ms per fraud query, each connection handles ~200 queries/s, so 5 connections handle 1,000 TPS comfortably.

3. **Caching user profiles**: Behavioral profiles (average amount, standard deviation) change slowly. Cache in application memory or Redis with a 5-minute TTL.

4. **Async rule isolation**: Run pattern-detection rules asynchronously via EventEmitter to avoid adding latency to the hot path.

5. **Batch aggregation**: For alert creation, buffer alerts in memory and flush in batches if alert volume is high (unlikely for fraud alerts but good practice).

**Circuit breaker**: If the fraud check service becomes slow or unresponsive, degrade gracefully:

```typescript
// If fraud check takes too long, allow the transaction and alert separately
const FRAUD_CHECK_TIMEOUT_MS = 50; // 50ms max for sync checks

async runSyncFraudChecks(context: FraudEvaluationContext): Promise<FraudAnalysisResult> {
  try {
    return await Promise.race([
      this.fraudAnalysisService.analyze(context),
      this.timeoutResult(FRAUD_CHECK_TIMEOUT_MS),
    ]);
  } catch (error) {
    // Log the failure, allow the transaction, flag for async review
    this.logger.warn('Fraud check failed, allowing transaction', { error });
    return { isFraudulent: false, riskScore: 0, /* ... */ };
  }
}
```

### 7.5 Suggested Implementation Priority

Given the project is a senior engineer assessment, prioritize demonstrating architectural thinking:

**Wave 1 (Core -- implement first):**
1. `IFraudRule` interface and `FraudCheckResult` type (domain/interfaces)
2. `FraudAnalysisService` domain service with rule orchestration
3. `VelocityCheckRule` implementation
4. `AmountThresholdRule` implementation
5. `FraudAlert` entity with lifecycle management
6. Integration into `ProcessTransactionUseCase` (synchronous path)

**Wave 2 (Async + API -- implement second):**
7. `IFraudAlertRepository` port and Prisma adapter
8. Fraud alert REST endpoints (GET alerts, GET by user, PUT resolve)
9. `TransactionCompletedEvent` and async fraud listener
10. `DepositWithdrawRule` (async pattern detection)

**Wave 3 (Polish -- if time allows):**
11. Alert aggregation logic
12. Composite rules (AND/OR/weighted scoring)
13. Cumulative amount threshold rule
14. Behavioral deviation rule

---

## Appendix A: Key Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Velocity check storage | PostgreSQL (not Redis) | Simplicity; sufficient for 1,000 TPS |
| Rule execution model | Strategy pattern with interface | Extensible, testable, clean architecture |
| Sync vs async split | Hybrid (velocity+amount sync, patterns async) | Balance latency and detection depth |
| Alert aggregation | Time-window based (30min) | Prevents alert fatigue |
| Fraud score | 0-100 numeric scale | Enables weighted composition and thresholds |
| Rule composition | AND/OR/Weighted composites | Maximum flexibility for rule definitions |
| Timestamp handling | UTC everywhere, database clock | Consistency across instances |
| Failure mode | Allow transaction, alert async | Availability over strict fraud prevention |

## Appendix B: PostgreSQL Index Recommendations

```sql
-- For velocity checks (most critical index)
CREATE INDEX idx_tx_user_created_status
ON transactions (user_id, created_at DESC)
WHERE status IN ('COMPLETED', 'PENDING');

-- For cumulative amount queries
CREATE INDEX idx_tx_user_type_created
ON transactions (user_id, type, created_at DESC)
WHERE status IN ('COMPLETED', 'PENDING');

-- For fraud alert queries
CREATE INDEX idx_alerts_user_status
ON fraud_alerts (user_id, status);

CREATE INDEX idx_alerts_status_severity
ON fraud_alerts (status, severity);

CREATE INDEX idx_alerts_created
ON fraud_alerts (created_at DESC);
```

## Appendix C: Environment Variables Summary

```bash
# Velocity checks
FRAUD_VELOCITY_WINDOW_MINUTES=5       # Time window for counting transactions
FRAUD_VELOCITY_MAX_TRANSACTIONS=10     # Max transactions per window

# Amount thresholds
FRAUD_AMOUNT_THRESHOLD=10000           # Single transaction threshold
FRAUD_CUMULATIVE_THRESHOLD=50000       # 24-hour cumulative threshold
FRAUD_CUMULATIVE_WINDOW_HOURS=24       # Cumulative window size

# Behavioral analysis
FRAUD_BEHAVIORAL_DEVIATION_MULTIPLIER=3  # Standard deviations for anomaly
FRAUD_BEHAVIORAL_MIN_HISTORY=10          # Min transactions before profiling

# Pattern detection
FRAUD_DEPOSIT_WITHDRAW_WINDOW_MINUTES=30  # Window for deposit-withdraw pattern
FRAUD_DEPOSIT_WITHDRAW_RATIO=0.8          # Withdrawal ratio to trigger

# Alert management
FRAUD_ALERT_AGGREGATION_WINDOW_MINUTES=30 # Aggregate alerts within this window

# Performance
FRAUD_SYNC_CHECK_TIMEOUT_MS=50            # Max time for synchronous checks
```

---

> **Research completed by**: fraud-researcher agent
> **Next step**: Use this document as input for the design phase (domain model design, database schema, API contracts)
