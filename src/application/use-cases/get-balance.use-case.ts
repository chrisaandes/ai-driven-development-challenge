import { Injectable, Inject } from '@nestjs/common';
import { IWalletRepository } from '../../domain/interfaces/wallet-repository.interface';
import { WalletNotFoundError } from '../../domain/errors/wallet-not-found.error';
import { INJECTION_TOKENS } from '../../domain/interfaces/injection-tokens';
import { ApplicationException } from '../exceptions/application.exception';
import { GetBalanceInput, GetBalanceOutput } from '../dtos/get-balance.dto';

/**
 * Retrieves the current balance for a user's wallet.
 *
 * Throws an ApplicationException (404) if no wallet exists for the user.
 * A wallet is created automatically on the first transaction, so a missing
 * wallet means the user has never transacted.
 */
@Injectable()
export class GetBalanceUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.WALLET_REPOSITORY)
    private readonly walletRepository: IWalletRepository,
  ) {}

  /**
   * Executes the get-balance use case.
   *
   * @param input - Contains the userId to look up
   * @returns Current balance and last-updated timestamp
   * @throws ApplicationException (404) if the wallet does not exist
   */
  async execute(input: GetBalanceInput): Promise<GetBalanceOutput> {
    const wallet = await this.walletRepository.findByUserId(input.userId);

    if (!wallet) {
      throw new ApplicationException(new WalletNotFoundError(input.userId));
    }

    return {
      userId: wallet.userId,
      balance: wallet.balance.value,
      lastUpdated: wallet.updatedAt,
    };
  }
}
