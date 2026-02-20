import { Injectable, Inject } from '@nestjs/common';
import type { IFraudAlertRepository } from '../../domain/interfaces/fraud-alert-repository.interface';
import { INJECTION_TOKENS } from '../../domain/interfaces/injection-tokens';
import {
  GetUserAlertsInput,
  FraudAlertOutput,
  FraudAlertListOutput,
} from '../dtos/fraud-alert.dto';

/**
 * Retrieves all fraud alerts for a specific user.
 *
 * Results are ordered by creation time descending (newest first),
 * as determined by the repository implementation.
 */
@Injectable()
export class GetUserAlertsUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.FRAUD_ALERT_REPOSITORY)
    private readonly fraudAlertRepository: IFraudAlertRepository,
  ) {}

  /**
   * Executes the get-user-alerts use case.
   *
   * @param input - Contains the userId whose alerts to retrieve
   * @returns An object containing the alerts array and total count
   */
  async execute(input: GetUserAlertsInput): Promise<FraudAlertListOutput> {
    const alerts = await this.fraudAlertRepository.findByUserId(input.userId);

    return {
      alerts: alerts.map(FraudAlertOutput.fromEntity),
      total: alerts.length,
    };
  }
}
