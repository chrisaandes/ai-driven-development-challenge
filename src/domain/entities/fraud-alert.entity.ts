import { Result } from '../common/result';
import { DomainError } from '../errors/domain-error';
import { AlertAlreadyResolvedError } from '../errors/alert-already-resolved.error';

/**
 * Alert types for fraud detection.
 */
export type FraudAlertType = 'HIGH_AMOUNT' | 'VELOCITY';

/**
 * Severity levels for fraud alerts.
 */
export type FraudAlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * FraudAlert entity representing a detected suspicious pattern.
 *
 * Alerts are created by the FraudDetectionService when a transaction
 * matches a fraud detection rule. They start as unresolved and can be
 * resolved by a system operator with resolution notes.
 *
 * Severity calculation:
 *
 * HIGH_AMOUNT alerts:
 *   - LOW:    amount > threshold AND amount < 2x threshold
 *   - MEDIUM: amount >= 2x threshold AND amount < 5x threshold
 *   - HIGH:   amount >= 5x threshold
 *
 * VELOCITY alerts:
 *   - MEDIUM:   count > max
 *   - HIGH:     count > 2x max
 *   - CRITICAL: count > 5x max
 *
 * @example
 * const alert = FraudAlert.create({
 *   transactionId: 'tx-uuid',
 *   userId: 'user-uuid',
 *   alertType: 'HIGH_AMOUNT',
 *   severity: 'MEDIUM',
 *   details: { amount: 25000, threshold: 10000 },
 * });
 */
export class FraudAlert {
  /**
   * Private constructor. Use FraudAlert.create() or FraudAlert.reconstitute().
   */
  private constructor(
    private readonly _id: string,
    private readonly _transactionId: string,
    private readonly _userId: string,
    private readonly _alertType: FraudAlertType,
    private readonly _severity: FraudAlertSeverity,
    private readonly _details: Record<string, unknown>,
    private _resolved: boolean,
    private _resolvedAt: Date | null,
    private _resolutionNotes: string | null,
    private readonly _createdAt: Date,
  ) {}

  /**
   * Creates a new unresolved fraud alert.
   *
   * @param props - The alert properties
   * @returns A new FraudAlert entity
   */
  static create(props: {
    transactionId: string;
    userId: string;
    alertType: FraudAlertType;
    severity: FraudAlertSeverity;
    details: Record<string, unknown>;
  }): FraudAlert {
    return new FraudAlert(
      crypto.randomUUID(),
      props.transactionId,
      props.userId,
      props.alertType,
      props.severity,
      props.details,
      false,
      null,
      null,
      new Date(),
    );
  }

  /**
   * Reconstitutes a fraud alert from persistence data.
   *
   * @param props - The raw persistence data
   * @returns A reconstituted FraudAlert entity
   */
  static reconstitute(props: {
    id: string;
    transactionId: string;
    userId: string;
    alertType: FraudAlertType;
    severity: FraudAlertSeverity;
    details: Record<string, unknown>;
    resolved: boolean;
    resolvedAt: Date | null;
    resolutionNotes: string | null;
    createdAt: Date;
  }): FraudAlert {
    return new FraudAlert(
      props.id,
      props.transactionId,
      props.userId,
      props.alertType,
      props.severity,
      props.details,
      props.resolved,
      props.resolvedAt,
      props.resolutionNotes,
      props.createdAt,
    );
  }

  /**
   * Calculates the severity for a HIGH_AMOUNT alert based on how much the
   * transaction amount exceeds the configured threshold.
   *
   * @param amount - The transaction amount (decimal)
   * @param threshold - The configured amount threshold (decimal)
   * @returns The calculated severity level
   *
   * Tiers:
   *   - amount >= 5x threshold => HIGH
   *   - amount >= 2x threshold => MEDIUM
   *   - amount >  threshold    => LOW
   */
  static calculateAmountSeverity(
    amount: number,
    threshold: number,
  ): FraudAlertSeverity {
    if (amount >= threshold * 5) {
      return 'HIGH';
    }
    if (amount >= threshold * 2) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Calculates the severity for a VELOCITY alert based on how much the
   * transaction count exceeds the configured maximum.
   *
   * @param count - The number of transactions in the window
   * @param maxTransactions - The configured max transactions per window
   * @returns The calculated severity level
   *
   * Tiers:
   *   - count > 5x max => CRITICAL
   *   - count > 2x max => HIGH
   *   - count > max    => MEDIUM
   */
  static calculateVelocitySeverity(
    count: number,
    maxTransactions: number,
  ): FraudAlertSeverity {
    if (count > maxTransactions * 5) {
      return 'CRITICAL';
    }
    if (count > maxTransactions * 2) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }

  /**
   * Marks this alert as resolved with the given notes.
   *
   * Business rules:
   * - An alert can only be resolved once.
   * - Resolution notes are required.
   *
   * @param notes - The resolution notes explaining the decision
   * @returns Result.ok(void) on success, or Result.fail(AlertAlreadyResolvedError)
   */
  resolve(notes: string): Result<void, DomainError> {
    if (this._resolved) {
      return Result.fail(
        new AlertAlreadyResolvedError(this._id),
      );
    }

    this._resolved = true;
    this._resolvedAt = new Date();
    this._resolutionNotes = notes;

    return Result.ok(undefined);
  }

  /** Unique alert identifier. */
  get id(): string {
    return this._id;
  }

  /** The transaction that triggered this alert. */
  get transactionId(): string {
    return this._transactionId;
  }

  /** The user associated with this alert. */
  get userId(): string {
    return this._userId;
  }

  /** The type of fraud detected (HIGH_AMOUNT or VELOCITY). */
  get alertType(): FraudAlertType {
    return this._alertType;
  }

  /** The severity level of this alert. */
  get severity(): FraudAlertSeverity {
    return this._severity;
  }

  /** Additional details about the alert (e.g., amounts, counts, thresholds). */
  get details(): Record<string, unknown> {
    return { ...this._details };
  }

  /** Whether this alert has been resolved. */
  get resolved(): boolean {
    return this._resolved;
  }

  /** When this alert was resolved (null if unresolved). */
  get resolvedAt(): Date | null {
    return this._resolvedAt;
  }

  /** Resolution notes (null if unresolved). */
  get resolutionNotes(): string | null {
    return this._resolutionNotes;
  }

  /** When this alert was created. */
  get createdAt(): Date {
    return this._createdAt;
  }
}
