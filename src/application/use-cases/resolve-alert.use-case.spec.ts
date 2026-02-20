import { ResolveAlertUseCase } from './resolve-alert.use-case';
import { IFraudAlertRepository } from '../../domain/interfaces/fraud-alert-repository.interface';
import { FraudAlert } from '../../domain/entities/fraud-alert.entity';
import { ApplicationException } from '../exceptions/application.exception';

describe('ResolveAlertUseCase', () => {
  let useCase: ResolveAlertUseCase;
  let fraudAlertRepository: jest.Mocked<IFraudAlertRepository>;

  const alertId = '550e8400-e29b-41d4-a716-446655440010';
  const transactionId = '550e8400-e29b-41d4-a716-446655440001';
  const userId = '550e8400-e29b-41d4-a716-446655440002';

  const makeUnresolvedAlert = (): FraudAlert =>
    FraudAlert.reconstitute({
      id: alertId,
      transactionId,
      userId,
      alertType: 'HIGH_AMOUNT',
      severity: 'MEDIUM',
      details: { amount: 25000, threshold: 10000 },
      resolved: false,
      resolvedAt: null,
      resolutionNotes: null,
      createdAt: new Date(),
    });

  const makeResolvedAlert = (): FraudAlert =>
    FraudAlert.reconstitute({
      id: alertId,
      transactionId,
      userId,
      alertType: 'HIGH_AMOUNT',
      severity: 'MEDIUM',
      details: { amount: 25000, threshold: 10000 },
      resolved: true,
      resolvedAt: new Date(),
      resolutionNotes: 'Already handled',
      createdAt: new Date(),
    });

  beforeEach(() => {
    fraudAlertRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findAll: jest.fn(),
      findByUserId: jest.fn(),
      findById: jest.fn(),
    };

    useCase = new ResolveAlertUseCase(fraudAlertRepository);
  });

  it('resolves an unresolved alert and persists it', async () => {
    fraudAlertRepository.findById.mockResolvedValue(makeUnresolvedAlert());

    const result = await useCase.execute({
      alertId,
      resolutionNotes: 'Verified with user, legitimate transaction',
    });

    expect(fraudAlertRepository.findById).toHaveBeenCalledWith(alertId);
    expect(fraudAlertRepository.save).toHaveBeenCalled();
    expect(result.resolved).toBe(true);
    expect(result.resolvedAt).not.toBeNull();
    expect(result.resolutionNotes).toBe('Verified with user, legitimate transaction');
  });

  it('resolves with empty notes when resolutionNotes is not provided', async () => {
    fraudAlertRepository.findById.mockResolvedValue(makeUnresolvedAlert());

    const result = await useCase.execute({ alertId });

    expect(result.resolved).toBe(true);
    expect(fraudAlertRepository.save).toHaveBeenCalled();
  });

  it('throws ApplicationException (404) when alert is not found', async () => {
    fraudAlertRepository.findById.mockResolvedValue(null);

    try {
      await useCase.execute({ alertId, resolutionNotes: 'test' });
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApplicationException);
      expect((err as ApplicationException).statusCode).toBe(404);
      expect((err as ApplicationException).code).toBe('ALERT_NOT_FOUND');
    }
  });

  it('throws ApplicationException (422) when alert is already resolved', async () => {
    fraudAlertRepository.findById.mockResolvedValue(makeResolvedAlert());

    try {
      await useCase.execute({ alertId, resolutionNotes: 'trying again' });
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApplicationException);
      expect((err as ApplicationException).statusCode).toBe(422);
      expect((err as ApplicationException).code).toBe('ALERT_ALREADY_RESOLVED');
    }
  });

  it('does not save the alert when it is not found', async () => {
    fraudAlertRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ alertId })).rejects.toThrow(ApplicationException);
    expect(fraudAlertRepository.save).not.toHaveBeenCalled();
  });

  it('does not save the alert when it is already resolved', async () => {
    fraudAlertRepository.findById.mockResolvedValue(makeResolvedAlert());

    await expect(useCase.execute({ alertId, resolutionNotes: 'again' })).rejects.toThrow(ApplicationException);
    expect(fraudAlertRepository.save).not.toHaveBeenCalled();
  });

  it('returns correct output DTO fields after resolution', async () => {
    fraudAlertRepository.findById.mockResolvedValue(makeUnresolvedAlert());

    const result = await useCase.execute({ alertId, resolutionNotes: 'Legit' });

    expect(result.id).toBe(alertId);
    expect(result.transactionId).toBe(transactionId);
    expect(result.userId).toBe(userId);
    expect(result.alertType).toBe('HIGH_AMOUNT');
    expect(result.severity).toBe('MEDIUM');
    expect(result.resolved).toBe(true);
  });
});
