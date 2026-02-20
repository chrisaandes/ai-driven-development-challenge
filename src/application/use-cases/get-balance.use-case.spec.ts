import { GetBalanceUseCase } from './get-balance.use-case';
import { IWalletRepository } from '../../domain/interfaces/wallet-repository.interface';
import { Wallet } from '../../domain/entities/wallet.entity';
import { Money } from '../../domain/value-objects/money.vo';
import { ApplicationException } from '../exceptions/application.exception';

describe('GetBalanceUseCase', () => {
  let useCase: GetBalanceUseCase;
  let walletRepository: jest.Mocked<IWalletRepository>;

  const userId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    walletRepository = {
      findByUserId: jest.fn(),
      findByUserIdWithLock: jest.fn(),
      save: jest.fn(),
    };

    useCase = new GetBalanceUseCase(walletRepository);
  });

  it('returns balance and lastUpdated for an existing wallet', async () => {
    const updatedAt = new Date('2026-01-15T12:00:00Z');
    const wallet = Wallet.reconstitute({
      id: 'wallet-1',
      userId,
      balance: Money.of(250.5),
      version: 3,
      createdAt: new Date('2026-01-01'),
      updatedAt,
    });
    walletRepository.findByUserId.mockResolvedValue(wallet);

    const result = await useCase.execute({ userId });

    expect(result.userId).toBe(userId);
    expect(result.balance).toBe(250.5);
    expect(result.lastUpdated).toBe(updatedAt);
  });

  it('throws ApplicationException (404) when wallet does not exist', async () => {
    walletRepository.findByUserId.mockResolvedValue(null);

    await expect(useCase.execute({ userId })).rejects.toThrow(
      ApplicationException,
    );
  });

  it('maps WalletNotFoundError to 404 status', async () => {
    walletRepository.findByUserId.mockResolvedValue(null);

    try {
      await useCase.execute({ userId });
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApplicationException);
      expect((err as ApplicationException).statusCode).toBe(404);
      expect((err as ApplicationException).code).toBe('WALLET_NOT_FOUND');
    }
  });
});
