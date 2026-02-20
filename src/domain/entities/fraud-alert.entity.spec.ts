import { FraudAlert, FraudAlertSeverity, FraudAlertType } from './fraud-alert.entity';
import { AlertAlreadyResolvedError } from '../errors/alert-already-resolved.error';

const BASE_PROPS = {
  transactionId: 'tx-001',
  userId: 'user-001',
  alertType: 'HIGH_AMOUNT' as FraudAlertType,
  severity: 'LOW' as FraudAlertSeverity,
  details: { amount: 15000, threshold: 10000 },
};

describe('FraudAlert', () => {
  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------

  describe('create()', () => {
    it('should create alert with provided props', () => {
      const alert = FraudAlert.create(BASE_PROPS);

      expect(alert.transactionId).toBe('tx-001');
      expect(alert.userId).toBe('user-001');
      expect(alert.alertType).toBe('HIGH_AMOUNT');
      expect(alert.severity).toBe('LOW');
    });

    it('should start as unresolved', () => {
      const alert = FraudAlert.create(BASE_PROPS);

      expect(alert.resolved).toBe(false);
      expect(alert.resolvedAt).toBeNull();
      expect(alert.resolutionNotes).toBeNull();
    });

    it('should generate a unique id', () => {
      const a = FraudAlert.create(BASE_PROPS);
      const b = FraudAlert.create(BASE_PROPS);

      expect(a.id).toBeDefined();
      expect(b.id).toBeDefined();
      expect(a.id).not.toBe(b.id);
    });

    it('should set createdAt to approximately now', () => {
      const before = new Date();
      const alert = FraudAlert.create(BASE_PROPS);
      const after = new Date();

      expect(alert.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(alert.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should store details immutably (defensive copy on get)', () => {
      const details = { amount: 15000, threshold: 10000 };
      const alert = FraudAlert.create({ ...BASE_PROPS, details });

      const returned = alert.details;
      returned['injected'] = 99;

      expect(alert.details['injected']).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // reconstitute()
  // ---------------------------------------------------------------------------

  describe('reconstitute()', () => {
    it('should recreate alert from persistence data', () => {
      const id = crypto.randomUUID();
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const resolvedAt = new Date('2026-01-02T00:00:00Z');

      const alert = FraudAlert.reconstitute({
        id,
        transactionId: 'tx-002',
        userId: 'user-002',
        alertType: 'VELOCITY',
        severity: 'CRITICAL',
        details: { count: 55 },
        resolved: true,
        resolvedAt,
        resolutionNotes: 'Legitimate bulk transfer',
        createdAt,
      });

      expect(alert.id).toBe(id);
      expect(alert.transactionId).toBe('tx-002');
      expect(alert.userId).toBe('user-002');
      expect(alert.alertType).toBe('VELOCITY');
      expect(alert.severity).toBe('CRITICAL');
      expect(alert.resolved).toBe(true);
      expect(alert.resolvedAt).toEqual(resolvedAt);
      expect(alert.resolutionNotes).toBe('Legitimate bulk transfer');
      expect(alert.createdAt).toEqual(createdAt);
    });

    it('should reconstitute unresolved alert correctly', () => {
      const alert = FraudAlert.reconstitute({
        id: crypto.randomUUID(),
        transactionId: 'tx-003',
        userId: 'user-003',
        alertType: 'HIGH_AMOUNT',
        severity: 'MEDIUM',
        details: {},
        resolved: false,
        resolvedAt: null,
        resolutionNotes: null,
        createdAt: new Date(),
      });

      expect(alert.resolved).toBe(false);
      expect(alert.resolvedAt).toBeNull();
      expect(alert.resolutionNotes).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // resolve()
  // ---------------------------------------------------------------------------

  describe('resolve()', () => {
    it('should mark alert as resolved with notes', () => {
      const alert = FraudAlert.create(BASE_PROPS);
      const before = new Date();
      const result = alert.resolve('Verified legitimate transaction');
      const after = new Date();

      expect(result.isSuccess).toBe(true);
      expect(alert.resolved).toBe(true);
      expect(alert.resolutionNotes).toBe('Verified legitimate transaction');
      expect(alert.resolvedAt).not.toBeNull();
      expect(alert.resolvedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(alert.resolvedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should fail with AlertAlreadyResolvedError when already resolved', () => {
      const alert = FraudAlert.create(BASE_PROPS);
      alert.resolve('First resolution');

      const result = alert.resolve('Second resolution');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(AlertAlreadyResolvedError);
    });

    it('should include alertId in AlertAlreadyResolvedError', () => {
      const alert = FraudAlert.create(BASE_PROPS);
      alert.resolve('First resolution');

      const result = alert.resolve('Second resolution');
      const error = result.error as AlertAlreadyResolvedError;

      expect(error.alertId).toBe(alert.id);
      expect(error.code).toBe('ALERT_ALREADY_RESOLVED');
    });
  });

  // ---------------------------------------------------------------------------
  // calculateAmountSeverity()
  // ---------------------------------------------------------------------------

  describe('calculateAmountSeverity()', () => {
    const threshold = 10000;

    it('should return LOW when amount > threshold and < 2x threshold', () => {
      expect(FraudAlert.calculateAmountSeverity(15000, threshold)).toBe<FraudAlertSeverity>('LOW');
    });

    it('should return LOW when amount is just above threshold', () => {
      expect(FraudAlert.calculateAmountSeverity(10001, threshold)).toBe<FraudAlertSeverity>('LOW');
    });

    it('should return MEDIUM when amount >= 2x threshold and < 5x threshold', () => {
      expect(FraudAlert.calculateAmountSeverity(20000, threshold)).toBe<FraudAlertSeverity>('MEDIUM');
      expect(FraudAlert.calculateAmountSeverity(35000, threshold)).toBe<FraudAlertSeverity>('MEDIUM');
      expect(FraudAlert.calculateAmountSeverity(49999, threshold)).toBe<FraudAlertSeverity>('MEDIUM');
    });

    it('should return HIGH when amount >= 5x threshold', () => {
      expect(FraudAlert.calculateAmountSeverity(50000, threshold)).toBe<FraudAlertSeverity>('HIGH');
      expect(FraudAlert.calculateAmountSeverity(100000, threshold)).toBe<FraudAlertSeverity>('HIGH');
    });
  });

  // ---------------------------------------------------------------------------
  // calculateVelocitySeverity()
  // ---------------------------------------------------------------------------

  describe('calculateVelocitySeverity()', () => {
    const max = 10;

    it('should return MEDIUM when count > max', () => {
      expect(FraudAlert.calculateVelocitySeverity(11, max)).toBe<FraudAlertSeverity>('MEDIUM');
      expect(FraudAlert.calculateVelocitySeverity(15, max)).toBe<FraudAlertSeverity>('MEDIUM');
      expect(FraudAlert.calculateVelocitySeverity(20, max)).toBe<FraudAlertSeverity>('MEDIUM');
    });

    it('should return HIGH when count > 2x max', () => {
      expect(FraudAlert.calculateVelocitySeverity(21, max)).toBe<FraudAlertSeverity>('HIGH');
      expect(FraudAlert.calculateVelocitySeverity(40, max)).toBe<FraudAlertSeverity>('HIGH');
      expect(FraudAlert.calculateVelocitySeverity(50, max)).toBe<FraudAlertSeverity>('HIGH');
    });

    it('should return CRITICAL when count > 5x max', () => {
      expect(FraudAlert.calculateVelocitySeverity(51, max)).toBe<FraudAlertSeverity>('CRITICAL');
      expect(FraudAlert.calculateVelocitySeverity(100, max)).toBe<FraudAlertSeverity>('CRITICAL');
    });
  });

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  describe('Getters', () => {
    it('should return all fields correctly from create()', () => {
      const alert = FraudAlert.create({
        transactionId: 'tx-getters',
        userId: 'user-getters',
        alertType: 'VELOCITY',
        severity: 'HIGH',
        details: { count: 25, max: 10 },
      });

      expect(alert.id).toBeDefined();
      expect(alert.transactionId).toBe('tx-getters');
      expect(alert.userId).toBe('user-getters');
      expect(alert.alertType).toBe('VELOCITY');
      expect(alert.severity).toBe('HIGH');
      expect(alert.details).toEqual({ count: 25, max: 10 });
      expect(alert.resolved).toBe(false);
      expect(alert.resolvedAt).toBeNull();
      expect(alert.resolutionNotes).toBeNull();
      expect(alert.createdAt).toBeInstanceOf(Date);
    });
  });
});
