import { ListFraudAlertsUseCase } from './list-fraud-alerts.use-case';
import { IFraudAlertRepository } from '../../domain/interfaces/fraud-alert-repository.interface';
import { FraudAlert } from '../../domain/entities/fraud-alert.entity';

describe('ListFraudAlertsUseCase', () => {
  let useCase: ListFraudAlertsUseCase;
  let fraudAlertRepository: jest.Mocked<IFraudAlertRepository>;

  const makeAlert = (resolved: boolean): FraudAlert =>
    FraudAlert.reconstitute({
      id: crypto.randomUUID(),
      transactionId: '550e8400-e29b-41d4-a716-446655440001',
      userId: '550e8400-e29b-41d4-a716-446655440002',
      alertType: 'HIGH_AMOUNT',
      severity: 'MEDIUM',
      details: { amount: 25000, threshold: 10000 },
      resolved,
      resolvedAt: resolved ? new Date() : null,
      resolutionNotes: resolved ? 'Verified' : null,
      createdAt: new Date(),
    });

  beforeEach(() => {
    fraudAlertRepository = {
      save: jest.fn(),
      findAll: jest.fn(),
      findByUserId: jest.fn(),
      findById: jest.fn(),
    };

    useCase = new ListFraudAlertsUseCase(fraudAlertRepository);
  });

  it('returns all alerts when no filter is provided', async () => {
    const alerts = [makeAlert(false), makeAlert(true)];
    fraudAlertRepository.findAll.mockResolvedValue(alerts);

    const result = await useCase.execute({});

    expect(fraudAlertRepository.findAll).toHaveBeenCalledWith(undefined);
    expect(result.total).toBe(2);
    expect(result.alerts).toHaveLength(2);
  });

  it('passes resolved=false filter to the repository', async () => {
    const unresolvedAlert = makeAlert(false);
    fraudAlertRepository.findAll.mockResolvedValue([unresolvedAlert]);

    const result = await useCase.execute({ resolved: false });

    expect(fraudAlertRepository.findAll).toHaveBeenCalledWith({
      resolved: false,
    });
    expect(result.total).toBe(1);
    expect(result.alerts[0].resolved).toBe(false);
  });

  it('passes resolved=true filter to the repository', async () => {
    const resolvedAlert = makeAlert(true);
    fraudAlertRepository.findAll.mockResolvedValue([resolvedAlert]);

    const result = await useCase.execute({ resolved: true });

    expect(fraudAlertRepository.findAll).toHaveBeenCalledWith({
      resolved: true,
    });
    expect(result.total).toBe(1);
    expect(result.alerts[0].resolved).toBe(true);
  });

  it('returns empty list when repository has no alerts', async () => {
    fraudAlertRepository.findAll.mockResolvedValue([]);

    const result = await useCase.execute({});

    expect(result.total).toBe(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('maps alert entity fields correctly to output DTO', async () => {
    const alert = makeAlert(false);
    fraudAlertRepository.findAll.mockResolvedValue([alert]);

    const result = await useCase.execute({});

    const output = result.alerts[0];
    expect(output.id).toBe(alert.id);
    expect(output.transactionId).toBe(alert.transactionId);
    expect(output.userId).toBe(alert.userId);
    expect(output.alertType).toBe('HIGH_AMOUNT');
    expect(output.severity).toBe('MEDIUM');
    expect(output.details).toEqual({ amount: 25000, threshold: 10000 });
    expect(output.resolved).toBe(false);
    expect(output.resolvedAt).toBeNull();
    expect(output.resolutionNotes).toBeNull();
  });
});
