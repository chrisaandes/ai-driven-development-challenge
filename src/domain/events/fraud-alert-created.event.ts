import { DomainEvent } from './domain-event';
import { FraudAlertType, FraudAlertSeverity } from '../entities/fraud-alert.entity';

/**
 * Event emitted when a new fraud alert has been created and persisted.
 *
 * Published after the alert is saved to the database.
 * Can be consumed by notification handlers, monitoring systems, etc.
 */
export class FraudAlertCreatedEvent extends DomainEvent {
  /**
   * @param alertId - The unique alert ID
   * @param transactionId - The transaction that triggered the alert
   * @param userId - The user associated with the alert
   * @param alertType - The type of fraud detected
   * @param severity - The severity level of the alert
   */
  constructor(
    public readonly alertId: string,
    public readonly transactionId: string,
    public readonly userId: string,
    public readonly alertType: FraudAlertType,
    public readonly severity: FraudAlertSeverity,
  ) {
    super('fraud.alert.created', alertId);
  }
}
