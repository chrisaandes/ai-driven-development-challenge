import { Injectable, Inject } from '@nestjs/common';
import type { IFraudAlertRepository } from '../../domain/interfaces/fraud-alert-repository.interface';
import { INJECTION_TOKENS } from '../../domain/interfaces/injection-tokens';
import { AlertAlreadyResolvedError } from '../../domain/errors/alert-already-resolved.error';
import { AlertNotFoundError } from '../../domain/errors/alert-not-found.error';
import { ApplicationException } from '../exceptions/application.exception';
import { ResolveAlertInput, FraudAlertOutput } from '../dtos/fraud-alert.dto';

/**
 * Marks a fraud alert as resolved with optional resolution notes.
 *
 * Business rules enforced:
 * - The alert must exist (throws 404 if not found).
 * - The alert must not already be resolved (throws 422 if already resolved).
 */
@Injectable()
export class ResolveAlertUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.FRAUD_ALERT_REPOSITORY)
    private readonly fraudAlertRepository: IFraudAlertRepository,
  ) {}

  /**
   * Executes the resolve-alert use case.
   *
   * @param input - Contains the alertId and optional resolutionNotes
   * @returns The updated FraudAlertOutput with resolved=true
   * @throws ApplicationException (404) if the alert is not found
   * @throws ApplicationException (422) if the alert is already resolved
   */
  async execute(input: ResolveAlertInput): Promise<FraudAlertOutput> {
    const alert = await this.fraudAlertRepository.findById(input.alertId);

    if (!alert) {
      throw new ApplicationException(new AlertNotFoundError(input.alertId));
    }

    const notes = input.resolutionNotes ?? '';
    const resolveResult = alert.resolve(notes);

    if (resolveResult.isFailure) {
      throw new ApplicationException(
        resolveResult.error as AlertAlreadyResolvedError,
      );
    }

    await this.fraudAlertRepository.save(alert);

    return FraudAlertOutput.fromEntity(alert);
  }
}
