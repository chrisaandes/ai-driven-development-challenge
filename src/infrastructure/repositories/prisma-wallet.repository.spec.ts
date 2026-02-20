import { PrismaWalletRepository } from './prisma-wallet.repository';
import { PrismaService } from '../database/prisma.service';
import { Wallet } from '../../domain/entities/wallet.entity';
import { Money } from '../../domain/value-objects/money.vo';

const USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const WALLET_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

/** Minimal Decimal-like object that mirrors what Prisma returns for Decimal columns. */
function decimal(value: number) {
  return { toNumber: () => value };
}

function makeWalletRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WALLET_ID,
    userId: USER_ID,
    balance: decimal(100.5),
    version: 1,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makePrismaService(): jest.Mocked<Pick<PrismaService, 'wallet' | '$queryRaw'>> {
  return {
    wallet: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    } as any,
    $queryRaw: jest.fn(),
  };
}

describe('PrismaWalletRepository', () => {
  let repository: PrismaWalletRepository;
  let prisma: ReturnType<typeof makePrismaService>;

  beforeEach(() => {
    prisma = makePrismaService();
    repository = new PrismaWalletRepository(prisma as unknown as PrismaService);
  });

  // ---------------------------------------------------------------------------
  // findByUserId
  // ---------------------------------------------------------------------------
  describe('findByUserId()', () => {
    it('returns a Wallet domain entity when found', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(makeWalletRecord());

      const result = await repository.findByUserId(USER_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(WALLET_ID);
      expect(result!.userId).toBe(USER_ID);
      expect(result!.balance.value).toBe(100.5);
      expect(result!.version).toBe(1);
    });

    it('returns null when no wallet exists for the user', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await repository.findByUserId(USER_ID);

      expect(result).toBeNull();
    });

    it('queries by userId', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);

      await repository.findByUserId(USER_ID);

      expect(prisma.wallet.findUnique).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // findByUserIdWithLock
  // ---------------------------------------------------------------------------
  describe('findByUserIdWithLock()', () => {
    it('returns a Wallet domain entity from raw query result', async () => {
      const row = {
        id: WALLET_ID,
        user_id: USER_ID,
        balance: '100.50',
        version: 2,
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-02-01T00:00:00Z'),
      };
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([row]);

      const result = await repository.findByUserIdWithLock(USER_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(WALLET_ID);
      expect(result!.userId).toBe(USER_ID);
      expect(result!.balance.value).toBe(100.5);
      expect(result!.version).toBe(2);
    });

    it('returns null when the raw query returns no rows', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await repository.findByUserIdWithLock(USER_ID);

      expect(result).toBeNull();
    });

    it('invokes $queryRaw (pessimistic lock)', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await repository.findByUserIdWithLock(USER_ID);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // save
  // ---------------------------------------------------------------------------
  describe('save()', () => {
    it('calls upsert with correct create payload for a new wallet', async () => {
      (prisma.wallet.upsert as jest.Mock).mockResolvedValue(undefined);
      const wallet = Wallet.create(USER_ID);

      await repository.save(wallet);

      expect(prisma.wallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: wallet.userId },
          create: expect.objectContaining({
            id: wallet.id,
            userId: wallet.userId,
            balance: 0,
          }),
          update: expect.objectContaining({
            balance: 0,
          }),
        }),
      );
    });

    it('calls upsert with updated balance after a deposit', async () => {
      (prisma.wallet.upsert as jest.Mock).mockResolvedValue(undefined);
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(250));

      await repository.save(wallet);

      expect(prisma.wallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ balance: 250 }),
        }),
      );
    });
  });
});
