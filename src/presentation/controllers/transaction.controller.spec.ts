import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { ProcessTransactionUseCase } from '../../application/use-cases/process-transaction.use-case';
import { GetTransactionHistoryUseCase } from '../../application/use-cases/get-transaction-history.use-case';
import { CreateTransactionRequestDto } from '../dtos/create-transaction-request.dto';
import { GetTransactionHistoryQueryDto } from '../dtos/get-transaction-history-query.dto';

const mockProcessTransactionUseCase = {
  execute: jest.fn(),
};

const mockGetTransactionHistoryUseCase = {
  execute: jest.fn(),
};

describe('TransactionController', () => {
  let controller: TransactionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionController],
      providers: [
        { provide: ProcessTransactionUseCase, useValue: mockProcessTransactionUseCase },
        { provide: GetTransactionHistoryUseCase, useValue: mockGetTransactionHistoryUseCase },
      ],
    }).compile();

    controller = module.get<TransactionController>(TransactionController);
    jest.clearAllMocks();
  });

  describe('processTransaction', () => {
    const dto: CreateTransactionRequestDto = {
      transaction_id: '550e8400-e29b-41d4-a716-446655440000',
      user_id: '550e8400-e29b-41d4-a716-446655440001',
      amount: 100.5,
      type: 'deposit',
      timestamp: '2024-01-15T10:30:00Z',
    };

    const useCaseOutput = {
      transactionId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'DEPOSIT',
      amount: 100.5,
      balanceAfter: 100.5,
      timestamp: new Date('2024-01-15T10:30:00.000Z'),
      isNew: true,
    };

    it('returns 201 for a new transaction', async () => {
      mockProcessTransactionUseCase.execute.mockResolvedValue(useCaseOutput);

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as import('express').Response;

      await controller.processTransaction(dto, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            transaction_id: '550e8400-e29b-41d4-a716-446655440000',
            type: 'deposit',
            amount: 100.5,
            balance_after: 100.5,
          }),
        }),
      );
    });

    it('returns 200 for an idempotent duplicate', async () => {
      mockProcessTransactionUseCase.execute.mockResolvedValue({ ...useCaseOutput, isNew: false });

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as import('express').Response;

      await controller.processTransaction(dto, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('maps type to uppercase before passing to use case', async () => {
      mockProcessTransactionUseCase.execute.mockResolvedValue(useCaseOutput);

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as import('express').Response;

      await controller.processTransaction(dto, res);

      expect(mockProcessTransactionUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DEPOSIT' }),
      );
    });

    it('maps type lowercase in response data', async () => {
      mockProcessTransactionUseCase.execute.mockResolvedValue(useCaseOutput);

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as import('express').Response;

      await controller.processTransaction(dto, res);

      const callArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(callArg.data.type).toBe('deposit');
    });
  });

  describe('getTransactionHistory', () => {
    const query: GetTransactionHistoryQueryDto = {
      user_id: '550e8400-e29b-41d4-a716-446655440001',
    };

    it('returns 200 with transaction list and total', async () => {
      const historyOutput = {
        transactions: [
          {
            transactionId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'DEPOSIT',
            amount: 100.5,
            balanceAfter: 100.5,
            timestamp: new Date('2024-01-15T10:30:00.000Z'),
          },
        ],
        total: 1,
      };
      mockGetTransactionHistoryUseCase.execute.mockResolvedValue(historyOutput);

      const result = await controller.getTransactionHistory(query);

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(1);
      expect(result.data.transactions).toHaveLength(1);
      expect(result.data.transactions[0].transaction_id).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(result.data.transactions[0].type).toBe('deposit');
    });

    it('returns empty list when user has no transactions', async () => {
      mockGetTransactionHistoryUseCase.execute.mockResolvedValue({
        transactions: [],
        total: 0,
      });

      const result = await controller.getTransactionHistory(query);

      expect(result.data.transactions).toHaveLength(0);
      expect(result.data.total).toBe(0);
    });

    it('passes user_id to use case', async () => {
      mockGetTransactionHistoryUseCase.execute.mockResolvedValue({
        transactions: [],
        total: 0,
      });

      await controller.getTransactionHistory(query);

      expect(mockGetTransactionHistoryUseCase.execute).toHaveBeenCalledWith({
        userId: '550e8400-e29b-41d4-a716-446655440001',
      });
    });
  });
});
