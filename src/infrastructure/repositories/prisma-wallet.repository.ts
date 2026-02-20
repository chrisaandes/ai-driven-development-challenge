import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@generated/prisma';
import { PrismaService } from '../database/prisma.service';
import { IWalletRepository } from '../../domain/interfaces/wallet-repository.interface';
import { Wallet } from '../../domain/entities/wallet.entity';
import { Money } from '../../domain/value-objects/money.vo';

/** Shape returned by the SELECT ... FOR UPDATE raw query. */
interface WalletRow {
  id: string;
  user_id: string;
  balance: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Prisma-backed implementation of IWalletRepository.
 *
 * Handles all wallet persistence operations including pessimistic locking
 * for concurrent balance updates. The toDomain() helper maps raw Prisma
 * records back to rich domain entities.
 */
@Injectable()
export class PrismaWalletRepository implements IWalletRepository {
  private readonly logger = new Logger(PrismaWalletRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds a wallet by the owning user's ID.
   *
   * @param userId - The user's UUID
   * @returns The wallet domain entity if found, null otherwise
   */
  async findByUserId(userId: string): Promise<Wallet | null> {
    const record = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  /**
   * Finds a wallet by user ID and acquires a pessimistic row-level lock
   * (SELECT ... FOR UPDATE). Must be called inside an active database
   * transaction to have any effect.
   *
   * Use this before modifying wallet balance to prevent lost-update anomalies
   * under concurrent requests.
   *
   * @param userId - The user's UUID
   * @returns The locked wallet domain entity if found, null otherwise
   */
  async findByUserIdWithLock(userId: string): Promise<Wallet | null> {
    const rows = await this.prisma.$queryRaw<WalletRow[]>(
      Prisma.sql`
        SELECT id, user_id, balance::text, version, created_at, updated_at
        FROM wallets
        WHERE user_id = ${userId}::uuid
        FOR UPDATE
      `,
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return Wallet.reconstitute({
      id: row.id,
      userId: row.user_id,
      balance: Money.of(Number(row.balance)),
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  /**
   * Persists a wallet entity (insert on first save, update on subsequent saves).
   * Uses upsert to handle both new wallets and balance updates atomically.
   *
   * @param wallet - The wallet entity to persist
   */
  async save(wallet: Wallet): Promise<void> {
    await this.prisma.wallet.upsert({
      where: { userId: wallet.userId },
      create: {
        id: wallet.id,
        userId: wallet.userId,
        balance: wallet.balance.value,
        version: wallet.version,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      },
      update: {
        balance: wallet.balance.value,
        updatedAt: wallet.updatedAt,
      },
    });

    this.logger.debug(
      `Wallet saved: id=${wallet.id} userId=${wallet.userId} balance=${wallet.balance.value}`,
    );
  }

  /**
   * Maps a Prisma wallet record to a Wallet domain entity.
   *
   * @param record - The raw Prisma wallet record
   * @returns A reconstituted Wallet entity
   */
  private toDomain(record: {
    id: string;
    userId: string;
    balance: { toNumber(): number };
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): Wallet {
    return Wallet.reconstitute({
      id: record.id,
      userId: record.userId,
      balance: Money.of(record.balance.toNumber()),
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
