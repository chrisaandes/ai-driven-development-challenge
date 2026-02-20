import { FraudAlert } from '../entities/fraud-alert.entity';

/**
 * Port for fraud alert persistence operations.
 *
 * Implemented by PrismaFraudAlertRepository in the infrastructure layer.
 * Injected into use cases via INJECTION_TOKENS.FRAUD_ALERT_REPOSITORY.
 */
export interface IFraudAlertRepository {
  /**
   * Persists a fraud alert.
   *
   * @param alert - The fraud alert entity to persist
   */
  save(alert: FraudAlert): Promise<void>;

  /**
   * Finds all fraud alerts, optionally filtered by resolved status.
   * Returns results ordered by creation time descending (newest first).
   *
   * @param options - Optional filter: { resolved: true } for resolved only,
   *                  { resolved: false } for unresolved only, or omit for all
   * @returns Array of fraud alerts
   */
  findAll(options?: { resolved?: boolean }): Promise<FraudAlert[]>;

  /**
   * Finds all fraud alerts for a specific user.
   * Returns results ordered by creation time descending.
   *
   * @param userId - The user's UUID
   * @returns Array of fraud alerts for the user
   */
  findByUserId(userId: string): Promise<FraudAlert[]>;

  /**
   * Finds a fraud alert by its ID.
   *
   * @param id - The alert's UUID
   * @returns The fraud alert if found, null otherwise
   */
  findById(id: string): Promise<FraudAlert | null>;
}
