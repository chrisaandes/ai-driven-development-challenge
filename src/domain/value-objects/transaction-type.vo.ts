/**
 * Value object representing the type of a financial transaction.
 * Acts as a type-safe enum with behavior methods.
 *
 * @example
 * const type = TransactionType.DEPOSIT;
 * if (type.isDeposit()) { ... }
 */
export class TransactionType {
  /** Deposit transaction: adds funds to wallet. */
  static readonly DEPOSIT = new TransactionType('DEPOSIT');

  /** Withdraw transaction: removes funds from wallet. */
  static readonly WITHDRAW = new TransactionType('WITHDRAW');

  /** All valid transaction types. */
  private static readonly VALID_TYPES: ReadonlyMap<string, TransactionType> = new Map([
    ['DEPOSIT', TransactionType.DEPOSIT],
    ['WITHDRAW', TransactionType.WITHDRAW],
  ]);

  /**
   * Private constructor. Use static members or fromString().
   * @param _value - The string representation of the type
   */
  private constructor(private readonly _value: string) {}

  /**
   * Creates a TransactionType from a string.
   *
   * @param value - The transaction type string (case-insensitive)
   * @returns The corresponding TransactionType instance
   * @throws Error if the string is not a valid type
   *
   * @example
   * const type = TransactionType.fromString('deposit'); // TransactionType.DEPOSIT
   */
  static fromString(value: string): TransactionType {
    const normalized = value.toUpperCase();
    const type = TransactionType.VALID_TYPES.get(normalized);
    if (!type) {
      throw new Error(
        `Invalid transaction type: "${value}". Must be one of: DEPOSIT, WITHDRAW`,
      );
    }
    return type;
  }

  /**
   * Returns the string value of this type.
   */
  get value(): string {
    return this._value;
  }

  /**
   * Returns true if this is a deposit transaction.
   */
  isDeposit(): boolean {
    return this === TransactionType.DEPOSIT;
  }

  /**
   * Returns true if this is a withdraw transaction.
   */
  isWithdraw(): boolean {
    return this === TransactionType.WITHDRAW;
  }

  /**
   * Equality check based on the underlying string value.
   */
  equals(other: TransactionType): boolean {
    return this._value === other._value;
  }

  /**
   * Returns the string representation.
   */
  toString(): string {
    return this._value;
  }
}
