import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@generated/prisma';

/**
 * Database service wrapping Prisma Client.
 * Handles connection lifecycle and provides transactional execution.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Connects to the database when the NestJS module initializes.
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to database...');
    await this.$connect();
    this.logger.log('Database connected');
  }

  /**
   * Disconnects from the database when the NestJS module is destroyed.
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * Executes a function within a database transaction.
   * Uses Prisma interactive transactions for ACID guarantees.
   *
   * @param fn - The function to execute within the transaction
   * @returns The result of the function
   */
  async executeInTransaction<T>(
    fn: (prisma: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(fn);
  }
}
