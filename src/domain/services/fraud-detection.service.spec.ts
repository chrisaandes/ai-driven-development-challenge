import { FraudDetectionService, FraudAnalysisResult, FraudConfig } from './fraud-detection.service';
import { FraudAlert, FraudAlertSeverity } from '../entities/fraud-alert.entity';
import { Transaction } from '../entities/transaction.entity';
import { Money } from '../value-objects/money.vo';
import { TransactionType } from '../value-objects/transaction-type.vo';

const DEFAULT_CONFIG: FraudConfig = {
  amountThreshold: 10000,
  velocityWindowMinutes: 5,
  velocityMaxTransactions: 10,
};

function makeTransaction(overrides: {
  id?: string;
  userId?: string;
  amount?: number;
  createdAt?: Date;
}): Transaction {
  return Transaction.reconstitute({
    id: overrides.id ?? crypto.randomUUID(),
    walletId: 'wallet-001',
    userId: overrides.userId ?? 'user-001',
    type: TransactionType.DEPOSIT,
    amount: Money.of(overrides.amount ?? 100),
    balanceAfter: Money.of(overrides.amount ?? 100),
    createdAt: overrides.createdAt ?? new Date(),
  });
}

describe('FraudDetectionService', () => {
  let service: FraudDetectionService;

  beforeEach(() => {
    service = new FraudDetectionService(DEFAULT_CONFIG);
  });

  // ---------------------------------------------------------------------------
  // Amount threshold detection
  // ---------------------------------------------------------------------------

  describe('High Amount Detection', () => {
    it('should return no alert when amount is exactly at threshold', () => {
      const tx = makeTransaction({ amount: 10000 });
      const result = service.analyze(tx, []);

      expect(result.hasAlerts()).toBe(false);
      expect(result.alerts).toHaveLength(0);
    });

    it('should return no alert when amount is below threshold', () => {
      const tx = makeTransaction({ amount: 5000 });
      const result = service.analyze(tx, []);

      expect(result.hasAlerts()).toBe(false);
    });

    it('should return LOW severity when amount > threshold and < 2x threshold', () => {
      const tx = makeTransaction({ amount: 15000 }); // 1.5x threshold
      const result = service.analyze(tx, []);

      expect(result.hasAlerts()).toBe(true);
      const alert = result.alerts.find((a) => a.alertType === 'HIGH_AMOUNT');
      expect(alert).toBeDefined();
      expect(alert!.severity).toBe<FraudAlertSeverity>('LOW');
    });

    it('should return MEDIUM severity when amount >= 2x threshold and < 5x threshold', () => {
      const tx = makeTransaction({ amount: 25000 }); // 2.5x threshold
      const result = service.analyze(tx, []);

      expect(result.hasAlerts()).toBe(true);
      const alert = result.alerts.find((a) => a.alertType === 'HIGH_AMOUNT');
      expect(alert!.severity).toBe<FraudAlertSeverity>('MEDIUM');
    });

    it('should return MEDIUM severity when amount is exactly 2x threshold', () => {
      const tx = makeTransaction({ amount: 20000 }); // exactly 2x
      const result = service.analyze(tx, []);

      const alert = result.alerts.find((a) => a.alertType === 'HIGH_AMOUNT');
      expect(alert!.severity).toBe<FraudAlertSeverity>('MEDIUM');
    });

    it('should return HIGH severity when amount >= 5x threshold', () => {
      const tx = makeTransaction({ amount: 50000 }); // 5x threshold
      const result = service.analyze(tx, []);

      const alert = result.alerts.find((a) => a.alertType === 'HIGH_AMOUNT');
      expect(alert!.severity).toBe<FraudAlertSeverity>('HIGH');
    });

    it('should return HIGH severity when amount is well above 5x threshold', () => {
      const tx = makeTransaction({ amount: 100000 }); // 10x threshold
      const result = service.analyze(tx, []);

      const alert = result.alerts.find((a) => a.alertType === 'HIGH_AMOUNT');
      expect(alert!.severity).toBe<FraudAlertSeverity>('HIGH');
    });

    it('should create alert with correct transactionId and userId', () => {
      const tx = makeTransaction({ id: 'tx-abc', userId: 'user-xyz', amount: 15000 });
      const result = service.analyze(tx, []);

      const alert = result.alerts.find((a) => a.alertType === 'HIGH_AMOUNT');
      expect(alert!.transactionId).toBe('tx-abc');
      expect(alert!.userId).toBe('user-xyz');
    });
  });

  // ---------------------------------------------------------------------------
  // Velocity detection
  // ---------------------------------------------------------------------------

  describe('Velocity Detection', () => {
    const now = new Date('2026-01-01T12:00:00Z');

    function makeRecentTransaction(secondsAgo: number, userId = 'user-001'): Transaction {
      return makeTransaction({
        userId,
        createdAt: new Date(now.getTime() - secondsAgo * 1000),
      });
    }

    it('should return no alert when transaction count equals max', () => {
      // 9 recent + 1 current = 10 = max; should NOT trigger
      const tx = makeTransaction({ userId: 'user-001', createdAt: now });
      const recent = Array.from({ length: 9 }, (_, i) =>
        makeRecentTransaction(60 + i * 10),
      );

      const result = service.analyze(tx, recent);
      const velocityAlert = result.alerts.find((a) => a.alertType === 'VELOCITY');
      expect(velocityAlert).toBeUndefined();
    });

    it('should return no alert when recent transactions is empty', () => {
      const tx = makeTransaction({ createdAt: now });
      const result = service.analyze(tx, []);

      const velocityAlert = result.alerts.find((a) => a.alertType === 'VELOCITY');
      expect(velocityAlert).toBeUndefined();
    });

    it('should return no alert for transactions outside the time window', () => {
      // Transactions 10 minutes old are outside a 5-minute window
      const tx = makeTransaction({ userId: 'user-001', createdAt: now });
      const outdated = Array.from({ length: 20 }, () =>
        makeRecentTransaction(600), // 10 minutes ago
      );

      const result = service.analyze(tx, outdated);
      const velocityAlert = result.alerts.find((a) => a.alertType === 'VELOCITY');
      expect(velocityAlert).toBeUndefined();
    });

    it('should return MEDIUM severity when count > max', () => {
      // 10 recent + 1 current = 11 > 10
      const tx = makeTransaction({ userId: 'user-001', createdAt: now });
      const recent = Array.from({ length: 10 }, (_, i) =>
        makeRecentTransaction(30 + i * 5),
      );

      const result = service.analyze(tx, recent);
      const alert = result.alerts.find((a) => a.alertType === 'VELOCITY');
      expect(alert).toBeDefined();
      expect(alert!.severity).toBe<FraudAlertSeverity>('MEDIUM');
    });

    it('should return HIGH severity when count > 2x max', () => {
      // 20 recent + 1 current = 21 > 20
      const tx = makeTransaction({ userId: 'user-001', createdAt: now });
      const recent = Array.from({ length: 20 }, (_, i) =>
        makeRecentTransaction(10 + i),
      );

      const result = service.analyze(tx, recent);
      const alert = result.alerts.find((a) => a.alertType === 'VELOCITY');
      expect(alert!.severity).toBe<FraudAlertSeverity>('HIGH');
    });

    it('should return CRITICAL severity when count > 5x max', () => {
      // 50 recent + 1 current = 51 > 50
      const tx = makeTransaction({ userId: 'user-001', createdAt: now });
      const recent = Array.from({ length: 50 }, (_, i) =>
        makeRecentTransaction(10 + i),
      );

      const result = service.analyze(tx, recent);
      const alert = result.alerts.find((a) => a.alertType === 'VELOCITY');
      expect(alert!.severity).toBe<FraudAlertSeverity>('CRITICAL');
    });

    it('should create alert with correct transactionId and userId', () => {
      const tx = makeTransaction({ id: 'tx-vel', userId: 'user-vel', createdAt: now });
      const recent = Array.from({ length: 10 }, (_, i) =>
        makeRecentTransaction(30 + i, 'user-vel'),
      );

      const result = service.analyze(tx, recent);
      const alert = result.alerts.find((a) => a.alertType === 'VELOCITY');
      expect(alert!.transactionId).toBe('tx-vel');
      expect(alert!.userId).toBe('user-vel');
    });
  });

  // ---------------------------------------------------------------------------
  // Combined rules
  // ---------------------------------------------------------------------------

  describe('Combined Rules', () => {
    const now = new Date('2026-01-01T12:00:00Z');

    it('should return two alerts when both amount and velocity are triggered', () => {
      const tx = makeTransaction({ userId: 'user-001', amount: 50000, createdAt: now });
      const recent = Array.from({ length: 10 }, (_, i) =>
        makeTransaction({ userId: 'user-001', createdAt: new Date(now.getTime() - (i + 1) * 5000) }),
      );

      const result = service.analyze(tx, recent);
      expect(result.alerts).toHaveLength(2);
      expect(result.alerts.some((a) => a.alertType === 'HIGH_AMOUNT')).toBe(true);
      expect(result.alerts.some((a) => a.alertType === 'VELOCITY')).toBe(true);
    });

    it('should return empty result when neither rule is triggered', () => {
      const tx = makeTransaction({ amount: 100, createdAt: now });
      const result = service.analyze(tx, []);

      expect(result.hasAlerts()).toBe(false);
      expect(result.alerts).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // FraudAnalysisResult
  // ---------------------------------------------------------------------------

  describe('FraudAnalysisResult', () => {
    it('hasAlerts() returns false when no alerts', () => {
      const r = new FraudAnalysisResult([]);
      expect(r.hasAlerts()).toBe(false);
    });

    it('hasAlerts() returns true when alerts present', () => {
      const alert = FraudAlert.create({
        transactionId: 'tx-1',
        userId: 'user-1',
        alertType: 'HIGH_AMOUNT',
        severity: 'LOW',
        details: {},
      });
      const r = new FraudAnalysisResult([alert]);
      expect(r.hasAlerts()).toBe(true);
    });

    it('highestSeverity() returns null when no alerts', () => {
      const r = new FraudAnalysisResult([]);
      expect(r.highestSeverity()).toBeNull();
    });

    it('highestSeverity() returns the single severity when one alert', () => {
      const alert = FraudAlert.create({
        transactionId: 'tx-1',
        userId: 'user-1',
        alertType: 'HIGH_AMOUNT',
        severity: 'MEDIUM',
        details: {},
      });
      const r = new FraudAnalysisResult([alert]);
      expect(r.highestSeverity()).toBe<FraudAlertSeverity>('MEDIUM');
    });

    it('highestSeverity() returns CRITICAL when CRITICAL and LOW are both present', () => {
      const low = FraudAlert.create({
        transactionId: 'tx-1',
        userId: 'user-1',
        alertType: 'HIGH_AMOUNT',
        severity: 'LOW',
        details: {},
      });
      const critical = FraudAlert.create({
        transactionId: 'tx-1',
        userId: 'user-1',
        alertType: 'VELOCITY',
        severity: 'CRITICAL',
        details: {},
      });
      const r = new FraudAnalysisResult([low, critical]);
      expect(r.highestSeverity()).toBe<FraudAlertSeverity>('CRITICAL');
    });

    it('highestSeverity() returns HIGH when HIGH and MEDIUM are present', () => {
      const medium = FraudAlert.create({
        transactionId: 'tx-1',
        userId: 'user-1',
        alertType: 'HIGH_AMOUNT',
        severity: 'MEDIUM',
        details: {},
      });
      const high = FraudAlert.create({
        transactionId: 'tx-1',
        userId: 'user-1',
        alertType: 'VELOCITY',
        severity: 'HIGH',
        details: {},
      });
      const r = new FraudAnalysisResult([medium, high]);
      expect(r.highestSeverity()).toBe<FraudAlertSeverity>('HIGH');
    });
  });
});
