import { DomainError } from './domain-error';

/**
 * Error when attempting to resolve a fraud alert that is already resolved.
 */
export class AlertAlreadyResolvedError extends DomainError {
  readonly code = 'ALERT_ALREADY_RESOLVED';

  /** The alert ID that was already resolved. */
  readonly alertId: string;

  constructor(alertId: string) {
    super(`Fraud alert already resolved: ${alertId}`);
    this.alertId = alertId;
  }
}
