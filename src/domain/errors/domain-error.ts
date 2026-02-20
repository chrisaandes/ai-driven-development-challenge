/**
 * Base class for all domain-level errors.
 *
 * Domain errors represent business rule violations. They are never thrown
 * in the domain layer -- they are returned inside Result.fail() instead.
 * The application layer catches them and translates to ApplicationException.
 *
 * Each subclass provides a unique `code` string for programmatic identification.
 */
export abstract class DomainError extends Error {
  /**
   * Machine-readable error code (e.g., 'INSUFFICIENT_BALANCE').
   * Used by the application layer for error mapping.
   */
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
