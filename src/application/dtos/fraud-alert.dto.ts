import { FraudAlert } from '../../domain/entities/fraud-alert.entity';

/**
 * Input for the ListFraudAlerts use case.
 */
export class ListFraudAlertsInput {
  /** Optional filter: true for resolved only, false for unresolved only, omit for all. */
  resolved?: boolean;
}

/**
 * Input for the GetUserAlerts use case.
 */
export class GetUserAlertsInput {
  /** UUID of the user whose alerts to retrieve. */
  userId: string;
}

/**
 * Input for the ResolveAlert use case.
 */
export class ResolveAlertInput {
  /** UUID of the alert to resolve. */
  alertId: string;

  /** Notes explaining the resolution decision. */
  resolutionNotes?: string;
}

/**
 * Output DTO representing a fraud alert.
 * Used as the response for all fraud alert use cases.
 */
export class FraudAlertOutput {
  /** Unique alert identifier. */
  id: string;

  /** The transaction that triggered this alert. */
  transactionId: string;

  /** The user associated with this alert. */
  userId: string;

  /** The type of fraud detected (HIGH_AMOUNT or VELOCITY). */
  alertType: string;

  /** The severity level of this alert. */
  severity: string;

  /** Additional details about the alert (e.g., amounts, counts, thresholds). */
  details: Record<string, unknown>;

  /** Whether this alert has been resolved. */
  resolved: boolean;

  /** When this alert was resolved (null if unresolved). */
  resolvedAt: Date | null;

  /** Resolution notes (null if unresolved). */
  resolutionNotes: string | null;

  /** When this alert was created. */
  createdAt: Date;

  /**
   * Creates a FraudAlertOutput from a FraudAlert domain entity.
   *
   * @param alert - The domain entity to map
   * @returns A populated FraudAlertOutput DTO
   */
  static fromEntity(alert: FraudAlert): FraudAlertOutput {
    const output = new FraudAlertOutput();
    output.id = alert.id;
    output.transactionId = alert.transactionId;
    output.userId = alert.userId;
    output.alertType = alert.alertType;
    output.severity = alert.severity;
    output.details = alert.details;
    output.resolved = alert.resolved;
    output.resolvedAt = alert.resolvedAt;
    output.resolutionNotes = alert.resolutionNotes;
    output.createdAt = alert.createdAt;
    return output;
  }
}

/**
 * Output for use cases that return a list of fraud alerts.
 */
export class FraudAlertListOutput {
  /** The list of fraud alert DTOs. */
  alerts: FraudAlertOutput[];

  /** Total number of alerts returned. */
  total: number;
}
