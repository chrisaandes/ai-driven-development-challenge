import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { GetBalanceUseCase } from '../../application/use-cases/get-balance.use-case';
import { GetBalanceParamsDto } from '../dtos/get-balance-params.dto';
import { ApplicationException } from '../../application/exceptions/application.exception';
import { WalletNotFoundError } from '../../domain/errors/wallet-not-found.error';

const mockGetBalanceUseCase = {
  execute: jest.fn(),
};

describe('WalletController', () => {
  let controller: WalletController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [{ provide: GetBalanceUseCase, useValue: mockGetBalanceUseCase }],
    }).compile();

    controller = module.get<WalletController>(WalletController);
    jest.clearAllMocks();
  });

  describe('getWalletBalance', () => {
    const params: GetBalanceParamsDto = {
      userId: '550e8400-e29b-41d4-a716-446655440001',
    };

    it('returns 200 with balance data in success envelope', async () => {
      const useCaseOutput = {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        balance: 50.5,
        lastUpdated: new Date('2024-01-15T11:00:00.000Z'),
      };
      mockGetBalanceUseCase.execute.mockResolvedValue(useCaseOutput);

      const result = await controller.getWalletBalance(params);

      expect(result.success).toBe(true);
      expect(result.data.user_id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(result.data.balance).toBe(50.5);
      expect(result.data.last_updated).toBe('2024-01-15T11:00:00.000Z');
      expect(result.meta.timestamp).toBeDefined();
    });

    it('passes userId to use case', async () => {
      mockGetBalanceUseCase.execute.mockResolvedValue({
        userId: '550e8400-e29b-41d4-a716-446655440001',
        balance: 0,
        lastUpdated: new Date(),
      });

      await controller.getWalletBalance(params);

      expect(mockGetBalanceUseCase.execute).toHaveBeenCalledWith({
        userId: '550e8400-e29b-41d4-a716-446655440001',
      });
    });

    it('propagates ApplicationException for wallet not found', async () => {
      mockGetBalanceUseCase.execute.mockRejectedValue(
        new ApplicationException(new WalletNotFoundError('550e8400-e29b-41d4-a716-446655440001')),
      );

      await expect(controller.getWalletBalance(params)).rejects.toBeInstanceOf(
        ApplicationException,
      );
    });
  });
});
