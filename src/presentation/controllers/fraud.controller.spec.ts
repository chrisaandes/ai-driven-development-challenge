import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FraudController } from './fraud.controller';
import { ListFraudAlertsUseCase } from '../../application/use-cases/list-fraud-alerts.use-case';
import { GetUserAlertsUseCase } from '../../application/use-cases/get-user-alerts.use-case';
import { ResolveAlertUseCase } from '../../application/use-cases/resolve-alert.use-case';
import { FraudAlertOutput } from '../../application/dtos/fraud-alert.dto';
import { ApplicationException } from '../../application/exceptions/application.exception';
import { AlertNotFoundError } from '../../domain/errors/alert-not-found.error';
import { AlertAlreadyResolvedError } from '../../domain/errors/alert-already-resolved.error';

const ALERT_ID = '660e8400-e29b-41d4-a716-446655440010';
const TRANSACTION_ID = '550e8400-e29b-41d4-a716-446655440005';
const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

function makeAlertOutput(overrides: Partial<FraudAlertOutput> = {}): FraudAlertOutput {
  const output = new FraudAlertOutput();
  output.id = ALERT_ID;
  output.transactionId = TRANSACTION_ID;
  output.userId = USER_ID;
  output.alertType = 'HIGH_AMOUNT';
  output.severity = 'MEDIUM';
  output.details = { amount: 25000, threshold: 10000 };
  output.resolved = false;
  output.resolvedAt = null;
  output.resolutionNotes = null;
  output.createdAt = new Date('2024-01-15T10:30:00.000Z');
  return Object.assign(output, overrides);
}

describe('FraudController', () => {
  let controller: FraudController;
  let listFraudAlertsUseCase: jest.Mocked<ListFraudAlertsUseCase>;
  let getUserAlertsUseCase: jest.Mocked<GetUserAlertsUseCase>;
  let resolveAlertUseCase: jest.Mocked<ResolveAlertUseCase>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FraudController],
      providers: [
        {
          provide: ListFraudAlertsUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: GetUserAlertsUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: ResolveAlertUseCase,
          useValue: { execute: jest.fn() },
        },
      ],
    })
      .overridePipe(ValidationPipe)
      .useValue(new ValidationPipe({ transform: true, whitelist: true }))
      .compile();

    controller = module.get<FraudController>(FraudController);
    listFraudAlertsUseCase = module.get(ListFraudAlertsUseCase);
    getUserAlertsUseCase = module.get(GetUserAlertsUseCase);
    resolveAlertUseCase = module.get(ResolveAlertUseCase);
  });

  describe('listFraudAlerts', () => {
    it('returns all alerts when no resolved filter is provided', async () => {
      const alertOutput = makeAlertOutput();
      listFraudAlertsUseCase.execute.mockResolvedValue({
        alerts: [alertOutput],
        total: 1,
      });

      const result = await controller.listFraudAlerts({});

      expect(listFraudAlertsUseCase.execute).toHaveBeenCalledWith({ resolved: undefined });
      expect(result.success).toBe(true);
      expect(result.data.total).toBe(1);
      expect(result.data.alerts).toHaveLength(1);
      expect(result.meta.timestamp).toBeDefined();
    });

    it('passes resolved=true to use case when query is "true"', async () => {
      listFraudAlertsUseCase.execute.mockResolvedValue({ alerts: [], total: 0 });

      await controller.listFraudAlerts({ resolved: 'true' });

      expect(listFraudAlertsUseCase.execute).toHaveBeenCalledWith({ resolved: true });
    });

    it('passes resolved=false to use case when query is "false"', async () => {
      listFraudAlertsUseCase.execute.mockResolvedValue({ alerts: [], total: 0 });

      await controller.listFraudAlerts({ resolved: 'false' });

      expect(listFraudAlertsUseCase.execute).toHaveBeenCalledWith({ resolved: false });
    });

    it('maps FraudAlertOutput to FraudAlertResponseDto correctly', async () => {
      const alertOutput = makeAlertOutput();
      listFraudAlertsUseCase.execute.mockResolvedValue({ alerts: [alertOutput], total: 1 });

      const result = await controller.listFraudAlerts({});

      const dto = result.data.alerts[0];
      expect(dto.id).toBe(ALERT_ID);
      expect(dto.transaction_id).toBe(TRANSACTION_ID);
      expect(dto.user_id).toBe(USER_ID);
      expect(dto.alert_type).toBe('HIGH_AMOUNT');
      expect(dto.severity).toBe('MEDIUM');
      expect(dto.details).toEqual({ amount: 25000, threshold: 10000 });
      expect(dto.resolved).toBe(false);
      expect(dto.resolved_at).toBeNull();
      expect(dto.resolution_notes).toBeNull();
      expect(dto.created_at).toBe('2024-01-15T10:30:00.000Z');
    });

    it('returns empty list when no alerts exist', async () => {
      listFraudAlertsUseCase.execute.mockResolvedValue({ alerts: [], total: 0 });

      const result = await controller.listFraudAlerts({});

      expect(result.data.alerts).toHaveLength(0);
      expect(result.data.total).toBe(0);
    });
  });

  describe('getAlertsByUser', () => {
    it('returns alerts for a given user', async () => {
      const alertOutput = makeAlertOutput();
      getUserAlertsUseCase.execute.mockResolvedValue({ alerts: [alertOutput], total: 1 });

      const result = await controller.getAlertsByUser({ userId: USER_ID });

      expect(getUserAlertsUseCase.execute).toHaveBeenCalledWith({ userId: USER_ID });
      expect(result.success).toBe(true);
      expect(result.data.total).toBe(1);
      expect(result.data.alerts[0].user_id).toBe(USER_ID);
    });

    it('returns empty list when user has no alerts', async () => {
      getUserAlertsUseCase.execute.mockResolvedValue({ alerts: [], total: 0 });

      const result = await controller.getAlertsByUser({ userId: USER_ID });

      expect(result.data.alerts).toHaveLength(0);
      expect(result.data.total).toBe(0);
    });

    it('maps response DTO fields correctly', async () => {
      const alertOutput = makeAlertOutput();
      getUserAlertsUseCase.execute.mockResolvedValue({ alerts: [alertOutput], total: 1 });

      const result = await controller.getAlertsByUser({ userId: USER_ID });

      const dto = result.data.alerts[0];
      expect(dto.id).toBe(ALERT_ID);
      expect(dto.transaction_id).toBe(TRANSACTION_ID);
      expect(dto.user_id).toBe(USER_ID);
    });
  });

  describe('resolveAlert', () => {
    it('resolves an alert and returns the resolved data', async () => {
      const resolvedAt = new Date('2024-01-15T12:00:00.000Z');
      const alertOutput = makeAlertOutput({
        resolved: true,
        resolvedAt,
        resolutionNotes: 'Verified with user, legitimate transaction',
      });
      resolveAlertUseCase.execute.mockResolvedValue(alertOutput);

      const result = await controller.resolveAlert(
        { id: ALERT_ID },
        { resolution_notes: 'Verified with user, legitimate transaction' },
      );

      expect(resolveAlertUseCase.execute).toHaveBeenCalledWith({
        alertId: ALERT_ID,
        resolutionNotes: 'Verified with user, legitimate transaction',
      });
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(ALERT_ID);
      expect(result.data.resolved).toBe(true);
      expect(result.data.resolved_at).toBe('2024-01-15T12:00:00.000Z');
      expect(result.data.resolution_notes).toBe('Verified with user, legitimate transaction');
    });

    it('resolves an alert without notes', async () => {
      const resolvedAt = new Date('2024-01-15T12:00:00.000Z');
      const alertOutput = makeAlertOutput({
        resolved: true,
        resolvedAt,
        resolutionNotes: null,
      });
      resolveAlertUseCase.execute.mockResolvedValue(alertOutput);

      const result = await controller.resolveAlert({ id: ALERT_ID }, {});

      expect(resolveAlertUseCase.execute).toHaveBeenCalledWith({
        alertId: ALERT_ID,
        resolutionNotes: undefined,
      });
      expect(result.data.resolution_notes).toBeNull();
    });

    it('propagates ApplicationException when alert is not found', async () => {
      const error = new ApplicationException(new AlertNotFoundError(ALERT_ID));
      resolveAlertUseCase.execute.mockRejectedValue(error);

      await expect(controller.resolveAlert({ id: ALERT_ID }, {})).rejects.toThrow(
        ApplicationException,
      );
    });

    it('propagates ApplicationException when alert is already resolved', async () => {
      const error = new ApplicationException(new AlertAlreadyResolvedError(ALERT_ID));
      resolveAlertUseCase.execute.mockRejectedValue(error);

      await expect(controller.resolveAlert({ id: ALERT_ID }, {})).rejects.toThrow(
        ApplicationException,
      );
    });

    it('returns success envelope with meta.timestamp', async () => {
      const resolvedAt = new Date('2024-01-15T12:00:00.000Z');
      const alertOutput = makeAlertOutput({ resolved: true, resolvedAt, resolutionNotes: null });
      resolveAlertUseCase.execute.mockResolvedValue(alertOutput);

      const result = await controller.resolveAlert({ id: ALERT_ID }, {});

      expect(result.success).toBe(true);
      expect(result.meta.timestamp).toBeDefined();
      expect(typeof result.meta.timestamp).toBe('string');
    });
  });
});
