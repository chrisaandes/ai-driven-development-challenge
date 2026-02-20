/**
 * Centralized dependency injection tokens.
 *
 * These string constants are used as NestJS DI tokens to bind domain
 * interfaces to their infrastructure implementations. Using constants
 * instead of magic strings prevents typos and enables refactoring.
 *
 * Usage in modules (infrastructure layer):
 *   { provide: INJECTION_TOKENS.WALLET_REPOSITORY, useClass: PrismaWalletRepository }
 *
 * Usage in use cases (application layer):
 *   @Inject(INJECTION_TOKENS.WALLET_REPOSITORY)
 *   private readonly walletRepository: IWalletRepository
 *
 * NOTE: This file contains only string constants and has zero framework
 * dependencies. It lives in the domain layer despite being consumed by
 * framework-aware layers.
 */
export const INJECTION_TOKENS = {
  /** Token for IWalletRepository implementations. */
  WALLET_REPOSITORY: 'IWalletRepository',

  /** Token for ITransactionRepository implementations. */
  TRANSACTION_REPOSITORY: 'ITransactionRepository',

  /** Token for IFraudAlertRepository implementations. */
  FRAUD_ALERT_REPOSITORY: 'IFraudAlertRepository',

  /** Token for FraudDetectionService (domain service). */
  FRAUD_DETECTION_SERVICE: 'IFraudDetectionService',

  /** Token for fraud detection configuration. */
  FRAUD_CONFIG: 'FRAUD_CONFIG',

  /** Token for the event publisher abstraction. */
  EVENT_PUBLISHER: 'IEventPublisher',
} as const;
