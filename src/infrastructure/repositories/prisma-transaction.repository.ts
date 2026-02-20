import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@generated/prisma';
import { PrismaService } from '../database/prisma.service';
import { ITransactionRepository } from '../../domain/interfaces/transaction-repository.interface';
import { Transaction } from '../../domain/entities/transaction.entity';
import { Money } from '../../domain/value-objects/money.vo';
import { TransactionType } from '../../domain/value-objects/transaction-type.vo';
import { DuplicateTransactionError } from '../../domain/errors/duplicate-transaction.error';

/**
 * Prisma-backed implementation of ITransactionRepository.
 *
 * Handles transaction persistence and retrieval. The transaction id field
 * doubles as the client-provided idempotency key (unique constraint in DB).
 * Unique constraint violations are caught and re-thrown as DuplicateTransactionError.
 */
@Injectable()
export class PrismaTransactionRepository implements ITransactionRepository {
  private readonly logger = new Logger(PrismaTransactionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists a new transaction.
   *
   * The transaction id is the client-provided idempotency key (UUID from the API
   * request). If a transaction with the same id already exists, a
   * DuplicateTransactionError is thrown so the application layer can return
   * the original result to the caller.
   *
   * @param transaction - The transaction entity to persist
   * @throws DuplicateTransactionError if the idempotency key already exists
   */
  async save(transaction: Transaction): Promise<void> {
    try {
      await this.prisma.transaction.create({
        data: {
          id: transaction.id,
          walletId: transaction.walletId,
          userId: transaction.userId,
          type: transaction.type.value as 'DEPOSIT' | 'WITHDRAW',
          amount: transaction.amount.value,
          balanceAfter: transaction.balanceAfter.value,
          createdAt: transaction.createdAt,
        },
      });

      this.logger.debug(
        `Transaction saved: id=${transaction.id} type=${transaction.type.value} amount=${transaction.amount.value}`,
      );
    } catch (error) {
      // P2002 = Unique constraint violation — idempotency key already exists
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new DuplicateTransactionError(transaction.id);
      }
      throw error;
    }
  }

  /**
   * Finds all transactions for a user, ordered by creation time descending
   * (newest first).
   *
   * @param userId - The user's UUID
   * @returns Array of Transaction entities, newest first
   */
  async findByUserId(userId: string): Promise<Transaction[]> {
    const records = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  /**
   * Finds a transaction by its idempotency key (the client-supplied transaction_id).
   * Used to detect duplicate requests before processing.
   *
   * @param transactionId - The client-provided transaction UUID
   * @returns The matching Transaction entity, or null if not found
   */
  async findByIdempotencyKey(transactionId: string): Promise<Transaction | null> {
    const record = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  /**
   * Counts the number of transactions made by a user from windowStart to now.
   * Used by the fraud detection velocity check.
   *
   * @param userId - The user's UUID
   * @param windowStart - The beginning of the time window (inclusive)
   * @returns The count of transactions in the window
   */
  async countByUserIdInWindow(userId: string, windowStart: Date): Promise<number> {
    return this.prisma.transaction.count({
      where: {
        userId,
        createdAt: { gte: windowStart },
      },
    });
  }

  /**
   * Maps a Prisma transaction record to a Transaction domain entity.
   *
   * @param record - The raw Prisma transaction record
   * @returns A reconstituted Transaction entity
   */
  private toDomain(record: {
    id: string;
    walletId: string;
    userId: string;
    type: string;
    amount: { toNumber(): number };
    balanceAfter: { toNumber(): number };
    createdAt: Date;
  }): Transaction {
    return Transaction.reconstitute({
      id: record.id,
      walletId: record.walletId,
      userId: record.userId,
      type: TransactionType.fromString(record.type),
      amount: Money.of(record.amount.toNumber()),
      balanceAfter: Money.of(record.balanceAfter.toNumber()),
      createdAt: record.createdAt,
    });
  }
}
