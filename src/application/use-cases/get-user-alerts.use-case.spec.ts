import { GetUserAlertsUseCase } from './get-user-alerts.use-case';
import { IFraudAlertRepository } from '../../domain/interfaces/fraud-alert-repository.interface';
import { FraudAlert } from '../../domain/entities/fraud-alert.entity';

describe('GetUserAlertsUseCase', () => {
  let useCase: GetUserAlertsUseCase;
  let fraudAlertRepository: jest.Mocked<IFraudAlertRepository>;

  const userId = '550e8400-e29b-41d4-a716-446655440002';

  const makeAlert = (overrides: Partial<Parameters<typeof FraudAlert.reconstitute>[0]> = {}): FraudAlert =>
    FraudAlert.reconstitute({
      id: crypto.randomUUID(),
      transactionId: '550e8400-e29b-41d4-a716-446655440001',
      userId,
      alertType: 'VELOCITY',
      severity: 'HIGH',
      details: { transactionCount: 25, maxTransactions: 10, windowMinutes: 5, ratio: 2.5 },
      resolved: false,
      resolvedAt: null,
      resolutionNotes: null,
      createdAt: new Date(),
      ...overrides,
    });

  beforeEach(() => {
    fraudAlertRepository = {
      save: jest.fn(),
      findAll: jest.fn(),
      findByUserId: jest.fn(),
      findById: jest.fn(),
    };

    useCase = new GetUserAlertsUseCase(fraudAlertRepository);
  });

  it('returns all alerts for the given user', async () => {
    const alerts = [makeAlert(), makeAlert()];
    fraudAlertRepository.findByUserId.mockResolvedValue(alerts);

    const result = await useCase.execute({ userId });

    expect(fraudAlertRepository.findByUserId).toHaveBeenCalledWith(userId);
    expect(result.total).toBe(2);
    expect(result.alerts).toHaveLength(2);
  });

  it('returns empty list when user has no alerts', async () => {
    fraudAlertRepository.findByUserId.mockResolvedValue([]);

    const result = await useCase.execute({ userId });

    expect(result.total).toBe(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('maps alert entity fields correctly to output DTO', async () => {
    const alert = makeAlert();
    fraudAlertRepository.findByUserId.mockResolvedValue([alert]);

    const result = await useCase.execute({ userId });

    const output = result.alerts[0];
    expect(output.id).toBe(alert.id);
    expect(output.transactionId).toBe(alert.transactionId);
    expect(output.userId).toBe(userId);
    expect(output.alertType).toBe('VELOCITY');
    expect(output.severity).toBe('HIGH');
    expect(output.resolved).toBe(false);
    expect(output.resolvedAt).toBeNull();
  });

  it('passes through the userId to the repository without modification', async () => {
    fraudAlertRepository.findByUserId.mockResolvedValue([]);

    await useCase.execute({ userId: 'specific-user-id' });

    expect(fraudAlertRepository.findByUserId).toHaveBeenCalledWith('specific-user-id');
  });
});
