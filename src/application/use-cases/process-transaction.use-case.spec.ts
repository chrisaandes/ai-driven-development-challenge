import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProcessTransactionUseCase } from './process-transaction.use-case';
import { IWalletRepository } from '../../domain/interfaces/wallet-repository.interface';
import { ITransactionRepository } from '../../domain/interfaces/transaction-repository.interface';
import { Wallet } from '../../domain/entities/wallet.entity';
import { Transaction } from '../../domain/entities/transaction.entity';
import { Money } from '../../domain/value-objects/money.vo';
import { TransactionType } from '../../domain/value-objects/transaction-type.vo';
import { ApplicationException } from '../exceptions/application.exception';

describe('ProcessTransactionUseCase', () => {
  let useCase: ProcessTransactionUseCase;
  let walletRepository: jest.Mocked<IWalletRepository>;
  let transactionRepository: jest.Mocked<ITransactionRepository>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const baseInput = {
    transactionId: '550e8400-e29b-41d4-a716-446655440001',
    userId: '550e8400-e29b-41d4-a716-446655440002',
    amount: 100,
    type: 'DEPOSIT' as const,
    timestamp: new Date('2026-01-01T10:00:00Z'),
  };

  beforeEach(() => {
    walletRepository = {
      findByUserId: jest.fn(),
      findByUserIdWithLock: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };

    transactionRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findByUserId: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      countByUserIdInWindow: jest.fn(),
    };

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    useCase = new ProcessTransactionUseCase(
      walletRepository,
      transactionRepository,
      eventEmitter,
    );
  });

  describe('deposit', () => {
    it('creates a new wallet when user has no wallet', async () => {
      walletRepository.findByUserId.mockResolvedValue(null);
      transactionRepository.findByIdempotencyKey.mockResolvedValue(null);

      const result = await useCase.execute(baseInput);

      expect(walletRepository.save).toHaveBeenCalled();
      expect(transactionRepository.save).toHaveBeenCalled();
      expect(result.balanceAfter).toBe(100);
      expect(result.isNew).toBe(true);
    });

    it('adds to an existing wallet balance', async () => {
      const existingWallet = Wallet.reconstitute({
        id: 'wallet-1',
        userId: baseInput.userId,
        balance: Money.of(50),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      walletRepository.findByUserId.mockResolvedValue(existingWallet);
      transactionRepository.findByIdempotencyKey.mockResolvedValue(null);

      const result = await useCase.execute(baseInput);

      expect(result.balanceAfter).toBe(150);
      expect(result.type).toBe('DEPOSIT');
      expect(result.amount).toBe(100);
      expect(result.isNew).toBe(true);
    });

    it('emits domain events after persistence', async () => {
      walletRepository.findByUserId.mockResolvedValue(null);
      transactionRepository.findByIdempotencyKey.mockResolvedValue(null);

      await useCase.execute(baseInput);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'transaction.processed',
        expect.objectContaining({ eventName: 'transaction.processed' }),
      );
    });
  });

  describe('withdraw', () => {
    it('subtracts from an existing wallet balance', async () => {
      const existingWallet = Wallet.reconstitute({
        id: 'wallet-1',
        userId: baseInput.userId,
        balance: Money.of(200),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      walletRepository.findByUserId.mockResolvedValue(existingWallet);
      transactionRepository.findByIdempotencyKey.mockResolvedValue(null);

      const result = await useCase.execute({
        ...baseInput,
        amount: 80,
        type: 'WITHDRAW',
      });

      expect(result.balanceAfter).toBe(120);
      expect(result.type).toBe('WITHDRAW');
      expect(result.isNew).toBe(true);
    });

    it('throws ApplicationException when balance is insufficient', async () => {
      const poorWallet = Wallet.reconstitute({
        id: 'wallet-1',
        userId: baseInput.userId,
        balance: Money.of(10),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      walletRepository.findByUserId.mockResolvedValue(poorWallet);
      transactionRepository.findByIdempotencyKey.mockResolvedValue(null);

      await expect(
        useCase.execute({ ...baseInput, amount: 100, type: 'WITHDRAW' }),
      ).rejects.toThrow(ApplicationException);
    });

    it('maps InsufficientBalanceError to 422 status', async () => {
      const poorWallet = Wallet.reconstitute({
        id: 'wallet-1',
        userId: baseInput.userId,
        balance: Money.of(10),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      walletRepository.findByUserId.mockResolvedValue(poorWallet);
      transactionRepository.findByIdempotencyKey.mockResolvedValue(null);

      try {
        await useCase.execute({ ...baseInput, amount: 100, type: 'WITHDRAW' });
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApplicationException);
        expect((err as ApplicationException).statusCode).toBe(422);
        expect((err as ApplicationException).code).toBe('INSUFFICIENT_BALANCE');
      }
    });
  });

  describe('idempotency', () => {
    it('returns existing transaction with isNew=false when same payload is replayed', async () => {
      const existingTx = Transaction.reconstitute({
        id: baseInput.transactionId,
        walletId: 'wallet-1',
        userId: baseInput.userId,
        type: TransactionType.DEPOSIT,
        amount: Money.of(100),
        balanceAfter: Money.of(100),
        createdAt: new Date('2026-01-01T10:00:00Z'),
      });
      transactionRepository.findByIdempotencyKey.mockResolvedValue(existingTx);

      const result = await useCase.execute(baseInput);

      expect(result.isNew).toBe(false);
      expect(result.transactionId).toBe(baseInput.transactionId);
      expect(walletRepository.save).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('throws ApplicationException (409) when same ID has different payload', async () => {
      const existingTx = Transaction.reconstitute({
        id: baseInput.transactionId,
        walletId: 'wallet-1',
        userId: baseInput.userId,
        type: TransactionType.DEPOSIT,
        amount: Money.of(999), // different amount
        balanceAfter: Money.of(999),
        createdAt: new Date(),
      });
      transactionRepository.findByIdempotencyKey.mockResolvedValue(existingTx);

      try {
        await useCase.execute(baseInput);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApplicationException);
        expect((err as ApplicationException).statusCode).toBe(409);
        expect((err as ApplicationException).code).toBe('DUPLICATE_TRANSACTION');
      }
    });
  });
});
