import { PrismaTransactionRepository } from './prisma-transaction.repository';
import { PrismaService } from '../database/prisma.service';
import { Wallet } from '../../domain/entities/wallet.entity';
import { Money } from '../../domain/value-objects/money.vo';
import { DuplicateTransactionError } from '../../domain/errors/duplicate-transaction.error';

const USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const WALLET_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const TX_ID = 'c0ffee00-beef-4000-8000-000000000001';

/** Minimal Decimal-like object that mirrors what Prisma returns for Decimal columns. */
function decimal(value: number) {
  return { toNumber: () => value };
}

function makeTxRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TX_ID,
    walletId: WALLET_ID,
    userId: USER_ID,
    type: 'DEPOSIT',
    amount: decimal(100),
    balanceAfter: decimal(200),
    createdAt: new Date('2024-03-01T12:00:00Z'),
    ...overrides,
  };
}

function makePrismaService(): jest.Mocked<Pick<PrismaService, 'transaction'>> {
  return {
    transaction: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    } as any,
  };
}

/** Creates a Transaction entity for testing via the Wallet aggregate. */
function makeDepositTransaction() {
  const wallet = Wallet.create(USER_ID);
  // Deposit so the Transaction is produced as a side effect
  const result = wallet.deposit(Money.of(100));
  return result.value!;
}

describe('PrismaTransactionRepository', () => {
  let repository: PrismaTransactionRepository;
  let prisma: ReturnType<typeof makePrismaService>;

  beforeEach(() => {
    prisma = makePrismaService();
    repository = new PrismaTransactionRepository(
      prisma as unknown as PrismaService,
    );
  });

  // ---------------------------------------------------------------------------
  // save
  // ---------------------------------------------------------------------------
  describe('save()', () => {
    it('calls transaction.create with correct data', async () => {
      (prisma.transaction.create as jest.Mock).mockResolvedValue(undefined);
      const tx = makeDepositTransaction();

      await repository.save(tx);

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: tx.id,
            walletId: tx.walletId,
            userId: tx.userId,
            type: 'DEPOSIT',
            amount: 100,
            balanceAfter: 100,
          }),
        }),
      );
    });

    it('throws DuplicateTransactionError on P2002 unique constraint violation', async () => {
      const prismaError = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
      });
      // Make it look like a PrismaClientKnownRequestError
      Object.setPrototypeOf(
        prismaError,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@prisma/client/runtime/client').PrismaClientKnownRequestError.prototype,
      );
      (prisma.transaction.create as jest.Mock).mockRejectedValue(prismaError);

      const tx = makeDepositTransaction();

      await expect(repository.save(tx)).rejects.toBeInstanceOf(
        DuplicateTransactionError,
      );
    });

    it('re-throws non-unique errors unchanged', async () => {
      const unexpectedError = new Error('connection lost');
      (prisma.transaction.create as jest.Mock).mockRejectedValue(unexpectedError);

      const tx = makeDepositTransaction();

      await expect(repository.save(tx)).rejects.toBe(unexpectedError);
    });
  });

  // ---------------------------------------------------------------------------
  // findByUserId
  // ---------------------------------------------------------------------------
  describe('findByUserId()', () => {
    it('returns an array of Transaction domain entities', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([
        makeTxRecord(),
        makeTxRecord({ id: 'another-id', type: 'WITHDRAW', amount: decimal(50), balanceAfter: decimal(150) }),
      ]);

      const results = await repository.findByUserId(USER_ID);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(TX_ID);
      expect(results[0].type.value).toBe('DEPOSIT');
      expect(results[1].type.value).toBe('WITHDRAW');
    });

    it('returns an empty array when no transactions exist', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const results = await repository.findByUserId(USER_ID);

      expect(results).toEqual([]);
    });

    it('queries with orderBy createdAt desc', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      await repository.findByUserId(USER_ID);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findByIdempotencyKey
  // ---------------------------------------------------------------------------
  describe('findByIdempotencyKey()', () => {
    it('returns a Transaction when found by id', async () => {
      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(makeTxRecord());

      const result = await repository.findByIdempotencyKey(TX_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(TX_ID);
      expect(result!.amount.value).toBe(100);
    });

    it('returns null when not found', async () => {
      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await repository.findByIdempotencyKey('nonexistent-id');

      expect(result).toBeNull();
    });

    it('queries by primary key id', async () => {
      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);

      await repository.findByIdempotencyKey(TX_ID);

      expect(prisma.transaction.findUnique).toHaveBeenCalledWith({
        where: { id: TX_ID },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // countByUserIdInWindow
  // ---------------------------------------------------------------------------
  describe('countByUserIdInWindow()', () => {
    it('returns the count from Prisma', async () => {
      (prisma.transaction.count as jest.Mock).mockResolvedValue(7);
      const windowStart = new Date('2024-03-01T11:00:00Z');

      const count = await repository.countByUserIdInWindow(USER_ID, windowStart);

      expect(count).toBe(7);
    });

    it('queries with correct userId and createdAt gte filter', async () => {
      (prisma.transaction.count as jest.Mock).mockResolvedValue(0);
      const windowStart = new Date('2024-03-01T11:00:00Z');

      await repository.countByUserIdInWindow(USER_ID, windowStart);

      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          createdAt: { gte: windowStart },
        },
      });
    });
  });
});
