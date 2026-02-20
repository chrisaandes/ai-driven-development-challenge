import { Injectable, Inject } from '@nestjs/common';
import type { ITransactionRepository } from '../../domain/interfaces/transaction-repository.interface';
import { INJECTION_TOKENS } from '../../domain/interfaces/injection-tokens';
import {
  GetTransactionHistoryInput,
  GetTransactionHistoryOutput,
} from '../dtos/get-history.dto';

/**
 * Retrieves the full transaction history for a user.
 *
 * Returns an empty list (not an error) when the user has no transactions.
 * Transactions are ordered newest-first as returned by the repository.
 */
@Injectable()
export class GetTransactionHistoryUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
  ) {}

  /**
   * Executes the get-transaction-history use case.
   *
   * @param input - Contains the userId to look up
   * @returns List of transactions and a total count
   */
  async execute(
    input: GetTransactionHistoryInput,
  ): Promise<GetTransactionHistoryOutput> {
    const transactions = await this.transactionRepository.findByUserId(
      input.userId,
    );

    return {
      transactions: transactions.map((tx) => ({
        transactionId: tx.id,
        type: tx.type.value,
        amount: tx.amount.value,
        balanceAfter: tx.balanceAfter.value,
        timestamp: tx.createdAt,
      })),
      total: transactions.length,
    };
  }
}
