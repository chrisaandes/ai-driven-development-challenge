import { DomainError } from './domain-error';

/**
 * Error when a fraud alert cannot be found by its ID.
 */
export class AlertNotFoundError extends DomainError {
  readonly code = 'ALERT_NOT_FOUND';

  /** The alert ID that was not found. */
  readonly alertId: string;

  constructor(alertId: string) {
    super(`Fraud alert not found: ${alertId}`);
    this.alertId = alertId;
  }
}
