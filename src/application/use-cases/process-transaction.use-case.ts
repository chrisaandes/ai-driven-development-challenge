import { Injectable, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IWalletRepository } from '../../domain/interfaces/wallet-repository.interface';
import type { ITransactionRepository } from '../../domain/interfaces/transaction-repository.interface';
import { Wallet } from '../../domain/entities/wallet.entity';
import { Money } from '../../domain/value-objects/money.vo';
import { INJECTION_TOKENS } from '../../domain/interfaces/injection-tokens';
import { DuplicateTransactionError } from '../../domain/errors/duplicate-transaction.error';
import { ApplicationException } from '../exceptions/application.exception';
import {
  ProcessTransactionInput,
  ProcessTransactionOutput,
} from '../dtos/process-transaction.dto';

/**
 * Processes a financial transaction (deposit or withdrawal) for a user.
 *
 * Handles idempotency by checking whether the given transactionId already exists:
 * - If the transaction exists with the same payload → returns existing result with isNew=false
 * - If the transaction exists with a different payload → throws ApplicationException (409)
 * - If the transaction is new → processes it and returns result with isNew=true
 *
 * Auto-creates a wallet for the user if one does not yet exist.
 *
 * After successful persistence, publishes domain events via EventEmitter2.
 */
@Injectable()
export class ProcessTransactionUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.WALLET_REPOSITORY)
    private readonly walletRepository: IWalletRepository,
    @Inject(INJECTION_TOKENS.TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Executes the process-transaction use case.
   *
   * @param input - Transaction details including userId, amount, type, and idempotency key
   * @returns Transaction result with new balance and an isNew flag
   * @throws ApplicationException if business rules are violated or a conflicting duplicate exists
   */
  async execute(input: ProcessTransactionInput): Promise<ProcessTransactionOutput> {
    // 1. Idempotency check: look up existing transaction by ID
    const existing = await this.transactionRepository.findByIdempotencyKey(
      input.transactionId,
    );

    if (existing) {
      // Same amount and same type → idempotent replay
      const sameAmount = existing.amount.value === input.amount;
      const sameType = existing.type.value === input.type;

      if (sameAmount && sameType) {
        return {
          transactionId: existing.id,
          type: existing.type.value,
          amount: existing.amount.value,
          balanceAfter: existing.balanceAfter.value,
          timestamp: existing.createdAt,
          isNew: false,
        };
      }

      // Different payload with the same ID → conflict
      throw new ApplicationException(
        new DuplicateTransactionError(input.transactionId),
      );
    }

    // 2. Get or create wallet
    let wallet = await this.walletRepository.findByUserId(input.userId);
    if (!wallet) {
      wallet = Wallet.create(input.userId);
    }

    // 3. Execute domain operation
    const amount = Money.of(input.amount);
    const result =
      input.type === 'DEPOSIT'
        ? wallet.deposit(amount)
        : wallet.withdraw(amount);

    if (result.isFailure) {
      throw new ApplicationException(result.error);
    }

    const transaction = result.value;

    // 4. Persist wallet and transaction
    await this.walletRepository.save(wallet);
    await this.transactionRepository.save(transaction);

    // 5. Publish domain events collected by the wallet aggregate
    const domainEvents = wallet.pullDomainEvents();
    for (const event of domainEvents) {
      this.eventEmitter.emit(event.eventName, event);
    }

    // 6. Return output DTO
    return {
      transactionId: transaction.id,
      type: transaction.type.value,
      amount: transaction.amount.value,
      balanceAfter: wallet.balance.value,
      timestamp: transaction.createdAt,
      isNew: true,
    };
  }
}
