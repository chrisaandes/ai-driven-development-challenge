import { Injectable, Inject } from '@nestjs/common';
import type { IFraudAlertRepository } from '../../domain/interfaces/fraud-alert-repository.interface';
import { INJECTION_TOKENS } from '../../domain/interfaces/injection-tokens';
import {
  ListFraudAlertsInput,
  FraudAlertOutput,
  FraudAlertListOutput,
} from '../dtos/fraud-alert.dto';

/**
 * Retrieves all fraud alerts, optionally filtered by resolved status.
 *
 * Results are ordered by creation time descending (newest first),
 * as determined by the repository implementation.
 */
@Injectable()
export class ListFraudAlertsUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.FRAUD_ALERT_REPOSITORY)
    private readonly fraudAlertRepository: IFraudAlertRepository,
  ) {}

  /**
   * Executes the list-fraud-alerts use case.
   *
   * @param input - Optional filter: { resolved: true } for resolved only,
   *                { resolved: false } for unresolved only, or empty for all
   * @returns An object containing the alerts array and total count
   */
  async execute(input: ListFraudAlertsInput): Promise<FraudAlertListOutput> {
    const options =
      input.resolved !== undefined ? { resolved: input.resolved } : undefined;

    const alerts = await this.fraudAlertRepository.findAll(options);

    return {
      alerts: alerts.map(FraudAlertOutput.fromEntity),
      total: alerts.length,
    };
  }
}
