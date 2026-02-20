import { PrismaFraudAlertRepository } from './prisma-fraud-alert.repository';
import { PrismaService } from '../database/prisma.service';
import { FraudAlert } from '../../domain/entities/fraud-alert.entity';

const USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const TX_ID = 'c0ffee00-beef-4000-8000-000000000001';
const ALERT_ID = 'deadbeef-cafe-4000-8000-000000000002';

function makeAlertRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ALERT_ID,
    transactionId: TX_ID,
    userId: USER_ID,
    alertType: 'HIGH_AMOUNT',
    severity: 'MEDIUM',
    details: { amount: 25000, threshold: 10000 },
    resolved: false,
    resolvedAt: null,
    resolutionNotes: null,
    createdAt: new Date('2024-04-01T10:00:00Z'),
    ...overrides,
  };
}

function makePrismaService(): jest.Mocked<Pick<PrismaService, 'fraudAlert'>> {
  return {
    fraudAlert: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    } as any,
  };
}

describe('PrismaFraudAlertRepository', () => {
  let repository: PrismaFraudAlertRepository;
  let prisma: ReturnType<typeof makePrismaService>;

  beforeEach(() => {
    prisma = makePrismaService();
    repository = new PrismaFraudAlertRepository(
      prisma as unknown as PrismaService,
    );
  });

  // ---------------------------------------------------------------------------
  // save
  // ---------------------------------------------------------------------------
  describe('save()', () => {
    it('calls fraudAlert.create with correct data', async () => {
      (prisma.fraudAlert.create as jest.Mock).mockResolvedValue(undefined);
      const alert = FraudAlert.create({
        transactionId: TX_ID,
        userId: USER_ID,
        alertType: 'HIGH_AMOUNT',
        severity: 'MEDIUM',
        details: { amount: 25000 },
      });

      await repository.save(alert);

      expect(prisma.fraudAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            transactionId: TX_ID,
            userId: USER_ID,
            alertType: 'HIGH_AMOUNT',
            severity: 'MEDIUM',
            resolved: false,
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------
  describe('findAll()', () => {
    it('returns all alerts when called without options', async () => {
      (prisma.fraudAlert.findMany as jest.Mock).mockResolvedValue([
        makeAlertRecord(),
        makeAlertRecord({ id: 'other-id', resolved: true }),
      ]);

      const results = await repository.findAll();

      expect(results).toHaveLength(2);
      expect(results[0]).toBeInstanceOf(FraudAlert);
    });

    it('passes resolved filter when options.resolved is provided', async () => {
      (prisma.fraudAlert.findMany as jest.Mock).mockResolvedValue([]);

      await repository.findAll({ resolved: false });

      expect(prisma.fraudAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resolved: false },
        }),
      );
    });

    it('passes no where clause when options is omitted', async () => {
      (prisma.fraudAlert.findMany as jest.Mock).mockResolvedValue([]);

      await repository.findAll();

      expect(prisma.fraudAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: undefined,
        }),
      );
    });

    it('orders results newest first', async () => {
      (prisma.fraudAlert.findMany as jest.Mock).mockResolvedValue([]);

      await repository.findAll();

      expect(prisma.fraudAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findByUserId
  // ---------------------------------------------------------------------------
  describe('findByUserId()', () => {
    it('returns alerts for the given user', async () => {
      (prisma.fraudAlert.findMany as jest.Mock).mockResolvedValue([makeAlertRecord()]);

      const results = await repository.findByUserId(USER_ID);

      expect(results).toHaveLength(1);
      expect(results[0].userId).toBe(USER_ID);
    });

    it('queries with userId filter and desc order', async () => {
      (prisma.fraudAlert.findMany as jest.Mock).mockResolvedValue([]);

      await repository.findByUserId(USER_ID);

      expect(prisma.fraudAlert.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------
  describe('findById()', () => {
    it('returns a FraudAlert entity when found', async () => {
      (prisma.fraudAlert.findUnique as jest.Mock).mockResolvedValue(makeAlertRecord());

      const result = await repository.findById(ALERT_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(ALERT_ID);
      expect(result!.alertType).toBe('HIGH_AMOUNT');
      expect(result!.severity).toBe('MEDIUM');
      expect(result!.resolved).toBe(false);
    });

    it('returns null when not found', async () => {
      (prisma.fraudAlert.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('correctly reconstitutes a resolved alert', async () => {
      const resolvedRecord = makeAlertRecord({
        resolved: true,
        resolvedAt: new Date('2024-04-02T10:00:00Z'),
        resolutionNotes: 'Verified as legitimate',
      });
      (prisma.fraudAlert.findUnique as jest.Mock).mockResolvedValue(resolvedRecord);

      const result = await repository.findById(ALERT_ID);

      expect(result!.resolved).toBe(true);
      expect(result!.resolvedAt).toEqual(new Date('2024-04-02T10:00:00Z'));
      expect(result!.resolutionNotes).toBe('Verified as legitimate');
    });
  });
});
