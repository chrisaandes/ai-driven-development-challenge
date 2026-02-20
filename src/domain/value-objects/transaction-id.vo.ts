/**
 * Value object wrapping a transaction UUID.
 * Ensures all transaction IDs are valid UUID v4 strings.
 *
 * @example
 * const id = TransactionId.generate();
 * const id2 = TransactionId.fromString('550e8400-e29b-41d4-a716-446655440000');
 */
export class TransactionId {
  /** UUID v4 regex pattern. */
  private static readonly UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * Private constructor. Use static factory methods.
   * @param _value - A validated UUID v4 string
   */
  private constructor(private readonly _value: string) {}

  /**
   * Generates a new random TransactionId.
   *
   * @returns A new TransactionId with a random UUID v4
   *
   * @example
   * const id = TransactionId.generate();
   */
  static generate(): TransactionId {
    return new TransactionId(crypto.randomUUID());
  }

  /**
   * Creates a TransactionId from an existing UUID string.
   *
   * @param id - A UUID v4 string
   * @returns A new TransactionId
   * @throws Error if the string is not a valid UUID v4
   *
   * @example
   * const id = TransactionId.fromString('550e8400-e29b-41d4-a716-446655440000');
   */
  static fromString(id: string): TransactionId {
    if (!TransactionId.UUID_V4_REGEX.test(id)) {
      throw new Error(`Invalid transaction ID: "${id}". Must be a valid UUID v4.`);
    }
    return new TransactionId(id);
  }

  /**
   * Returns the underlying UUID string.
   */
  get value(): string {
    return this._value;
  }

  /**
   * Equality check based on the UUID string.
   */
  equals(other: TransactionId): boolean {
    return this._value === other._value;
  }

  /**
   * Returns the UUID string.
   */
  toString(): string {
    return this._value;
  }
}
