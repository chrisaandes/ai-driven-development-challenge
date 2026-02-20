/**
 * Base class for all domain events.
 *
 * Domain events capture something important that happened in the domain.
 * They are collected by entities (see Wallet.pullDomainEvents()) and
 * published by the application layer (via EventEmitter2) after the
 * aggregate has been persisted.
 *
 * Each event carries:
 * - eventName: Used as the EventEmitter2 event key (e.g., 'transaction.processed')
 * - occurredAt: When the event happened
 * - aggregateId: The ID of the aggregate root that produced the event
 */
export abstract class DomainEvent {
  /** When this event occurred. */
  public readonly occurredAt: Date;

  /**
   * @param eventName - The event name used as the EventEmitter2 event key
   * @param aggregateId - The ID of the aggregate root that produced this event
   */
  protected constructor(
    public readonly eventName: string,
    public readonly aggregateId: string,
  ) {
    this.occurredAt = new Date();
  }
}
