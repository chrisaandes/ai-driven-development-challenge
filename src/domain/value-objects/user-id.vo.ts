/**
 * Value object wrapping a user UUID.
 * Ensures all user IDs are valid UUID v4 strings.
 *
 * @example
 * const userId = UserId.generate();
 * const userId2 = UserId.fromString('550e8400-e29b-41d4-a716-446655440001');
 */
export class UserId {
  /** UUID v4 regex pattern. */
  private static readonly UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * Private constructor. Use static factory methods.
   * @param _value - A validated UUID v4 string
   */
  private constructor(private readonly _value: string) {}

  /**
   * Generates a new random UserId.
   *
   * @returns A new UserId with a random UUID v4
   *
   * @example
   * const id = UserId.generate();
   */
  static generate(): UserId {
    return new UserId(crypto.randomUUID());
  }

  /**
   * Creates a UserId from an existing UUID string.
   *
   * @param id - A UUID v4 string
   * @returns A new UserId
   * @throws Error if the string is not a valid UUID v4
   *
   * @example
   * const id = UserId.fromString('550e8400-e29b-41d4-a716-446655440001');
   */
  static fromString(id: string): UserId {
    if (!UserId.UUID_V4_REGEX.test(id)) {
      throw new Error(`Invalid user ID: "${id}". Must be a valid UUID v4.`);
    }
    return new UserId(id);
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
  equals(other: UserId): boolean {
    return this._value === other._value;
  }

  /**
   * Returns the UUID string.
   */
  toString(): string {
    return this._value;
  }
}
