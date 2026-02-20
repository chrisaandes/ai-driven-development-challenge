/**
 * Value object representing a monetary amount.
 *
 * Stores the amount internally as integer cents to avoid
 * floating-point precision errors in financial calculations.
 * All operations are immutable and return new Money instances.
 *
 * @example
 * const price = Money.of(100.50);     // 10050 cents internally
 * const tax = Money.of(10.05);        // 1005 cents internally
 * const total = price.add(tax);       // 11055 cents = 110.55
 * console.log(total.value);           // 110.55
 * console.log(total.cents);           // 11055
 */
export class Money {
  /** Maximum monetary value: 999,999,999.99 */
  private static readonly MAX_CENTS = 99_999_999_999;

  /**
   * Private constructor. Use static factory methods to create instances.
   * @param _cents - The amount stored as integer cents.
   */
  private constructor(private readonly _cents: number) {
    if (!Number.isFinite(_cents)) {
      throw new Error('Money amount must be a finite number');
    }
    if (!Number.isInteger(_cents)) {
      throw new Error('Money internal value must be an integer (cents)');
    }
    if (Math.abs(_cents) > Money.MAX_CENTS) {
      throw new Error(
        `Money amount exceeds maximum allowed value of 999,999,999.99 (got ${_cents / 100})`,
      );
    }
  }

  /**
   * Creates a Money instance from a decimal amount.
   * Rounds to nearest cent to handle floating-point imprecision.
   *
   * @param amount - Decimal amount (e.g., 100.50)
   * @returns A new Money instance
   * @throws Error if amount is not finite, exceeds max value, or has more than 2 decimal places
   *
   * @example
   * const money = Money.of(100.50); // 10050 cents
   */
  static of(amount: number): Money {
    if (!Number.isFinite(amount)) {
      throw new Error('Money amount must be a finite number');
    }

    // Check for more than 2 decimal places
    const decimalStr = amount.toString();
    const decimalIndex = decimalStr.indexOf('.');
    if (decimalIndex !== -1) {
      const decimalPlaces = decimalStr.length - decimalIndex - 1;
      if (decimalPlaces > 2) {
        throw new Error(
          `Money amount must have at most 2 decimal places (got ${decimalPlaces})`,
        );
      }
    }

    const cents = Math.round(amount * 100);
    return new Money(cents);
  }

  /**
   * Creates a Money instance from integer cents.
   *
   * @param cents - Integer cents (e.g., 10050 for $100.50)
   * @returns A new Money instance
   * @throws Error if cents is not an integer or exceeds max value
   *
   * @example
   * const money = Money.fromCents(10050); // represents 100.50
   */
  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) {
      throw new Error('Cents must be an integer');
    }
    return new Money(cents);
  }

  /**
   * Creates a Money instance representing zero.
   *
   * @returns A new Money instance with value 0
   *
   * @example
   * const zero = Money.zero();
   * console.log(zero.value); // 0
   */
  static zero(): Money {
    return new Money(0);
  }

  /**
   * Returns the decimal representation of the amount.
   *
   * @example
   * Money.of(100.50).value // 100.50
   */
  get value(): number {
    return this._cents / 100;
  }

  /**
   * Returns the raw integer cents.
   *
   * @example
   * Money.of(100.50).cents // 10050
   */
  get cents(): number {
    return this._cents;
  }

  /**
   * Adds another Money amount to this one.
   * Returns a new Money instance (immutable).
   *
   * @param other - The Money amount to add
   * @returns A new Money instance with the sum
   *
   * @example
   * Money.of(100).add(Money.of(50)) // Money representing 150.00
   */
  add(other: Money): Money {
    return new Money(this._cents + other._cents);
  }

  /**
   * Subtracts another Money amount from this one.
   * Returns a new Money instance (immutable).
   * The result can be negative.
   *
   * @param other - The Money amount to subtract
   * @returns A new Money instance with the difference
   *
   * @example
   * Money.of(100).subtract(Money.of(30)) // Money representing 70.00
   */
  subtract(other: Money): Money {
    return new Money(this._cents - other._cents);
  }

  /**
   * Multiplies this Money by a scalar factor.
   * Result is rounded to the nearest cent.
   *
   * @param factor - The scalar to multiply by
   * @returns A new Money instance with the product
   *
   * @example
   * Money.of(100).multiply(1.5) // Money representing 150.00
   */
  multiply(factor: number): Money {
    if (!Number.isFinite(factor)) {
      throw new Error('Multiplication factor must be a finite number');
    }
    return new Money(Math.round(this._cents * factor));
  }

  /**
   * Returns true if this amount is less than the other.
   *
   * @param other - The Money amount to compare against
   * @returns true if this < other
   */
  isLessThan(other: Money): boolean {
    return this._cents < other._cents;
  }

  /**
   * Returns true if this amount is greater than the other.
   *
   * @param other - The Money amount to compare against
   * @returns true if this > other
   */
  isGreaterThan(other: Money): boolean {
    return this._cents > other._cents;
  }

  /**
   * Returns true if this amount is negative or zero.
   *
   * @returns true if cents <= 0
   */
  isNegativeOrZero(): boolean {
    return this._cents <= 0;
  }

  /**
   * Returns true if this Money has the same amount as the other.
   *
   * @param other - The Money amount to compare against
   * @returns true if both represent the same cent value
   */
  equals(other: Money): boolean {
    return this._cents === other._cents;
  }

  /**
   * Returns a string representation for debugging.
   */
  toString(): string {
    return `Money(${this.value.toFixed(2)})`;
  }
}
