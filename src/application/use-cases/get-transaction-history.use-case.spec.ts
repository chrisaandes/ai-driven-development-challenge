import { GetTransactionHistoryUseCase } from './get-transaction-history.use-case';
import { ITransactionRepository } from '../../domain/interfaces/transaction-repository.interface';
import { Transaction } from '../../domain/entities/transaction.entity';
import { Money } from '../../domain/value-objects/money.vo';
import { TransactionType } from '../../domain/value-objects/transaction-type.vo';

describe('GetTransactionHistoryUseCase', () => {
  let useCase: GetTransactionHistoryUseCase;
  let transactionRepository: jest.Mocked<ITransactionRepository>;

  const userId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    transactionRepository = {
      save: jest.fn(),
      findByUserId: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      countByUserIdInWindow: jest.fn(),
    };

    useCase = new GetTransactionHistoryUseCase(transactionRepository);
  });

  it('returns empty list when user has no transactions', async () => {
    transactionRepository.findByUserId.mockResolvedValue([]);

    const result = await useCase.execute({ userId });

    expect(result.transactions).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('returns transactions mapped to output DTOs', async () => {
    const tx1 = Transaction.reconstitute({
      id: 'tx-1',
      walletId: 'wallet-1',
      userId,
      type: TransactionType.DEPOSIT,
      amount: Money.of(100),
      balanceAfter: Money.of(100),
      createdAt: new Date('2026-01-10T10:00:00Z'),
    });
    const tx2 = Transaction.reconstitute({
      id: 'tx-2',
      walletId: 'wallet-1',
      userId,
      type: TransactionType.WITHDRAW,
      amount: Money.of(30),
      balanceAfter: Money.of(70),
      createdAt: new Date('2026-01-11T10:00:00Z'),
    });
    transactionRepository.findByUserId.mockResolvedValue([tx2, tx1]);

    const result = await useCase.execute({ userId });

    expect(result.total).toBe(2);
    expect(result.transactions[0]).toEqual({
      transactionId: 'tx-2',
      type: 'WITHDRAW',
      amount: 30,
      balanceAfter: 70,
      timestamp: tx2.createdAt,
    });
    expect(result.transactions[1]).toEqual({
      transactionId: 'tx-1',
      type: 'DEPOSIT',
      amount: 100,
      balanceAfter: 100,
      timestamp: tx1.createdAt,
    });
  });

  it('queries the repository with the correct userId', async () => {
    transactionRepository.findByUserId.mockResolvedValue([]);

    await useCase.execute({ userId });

    expect(transactionRepository.findByUserId).toHaveBeenCalledWith(userId);
  });
});
