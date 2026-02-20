/**
 * A discriminated union type representing either a success value (T)
 * or a failure error (E).
 *
 * Domain methods return Result instead of throwing exceptions,
 * making failure modes explicit in the type signature.
 *
 * @typeParam T - The success value type
 * @typeParam E - The error type (defaults to Error)
 *
 * @example
 * // Creating results:
 * const success = Result.ok(42);
 * const failure = Result.fail(new InsufficientBalanceError(...));
 *
 * // Consuming results:
 * if (result.isSuccess) {
 *   console.log(result.value);
 * } else {
 *   console.log(result.error.message);
 * }
 *
 * // Chaining operations:
 * const doubled = result.map(x => x * 2);
 * const chained = result.flatMap(x => anotherOperation(x));
 */
export class Result<T, E extends Error = Error> {
  /**
   * Private constructor. Use Result.ok() or Result.fail().
   */
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  /**
   * Creates a successful result containing a value.
   *
   * @param value - The success value
   * @returns A successful Result<T, never>
   *
   * @example
   * const result = Result.ok(42);
   * result.isSuccess // true
   * result.value     // 42
   */
  static ok<T>(value: T): Result<T, never> {
    return new Result<T, never>(true, value, undefined);
  }

  /**
   * Creates a failed result containing an error.
   *
   * @param error - The error
   * @returns A failed Result<never, E>
   *
   * @example
   * const result = Result.fail(new Error('Something went wrong'));
   * result.isFailure // true
   * result.error     // Error('Something went wrong')
   */
  static fail<E extends Error>(error: E): Result<never, E> {
    return new Result<never, E>(false, undefined, error);
  }

  /**
   * Returns true if the result represents success.
   */
  get isSuccess(): boolean {
    return this._isSuccess;
  }

  /**
   * Returns true if the result represents failure.
   */
  get isFailure(): boolean {
    return !this._isSuccess;
  }

  /**
   * Returns the success value.
   * Throws an Error if the result is a failure.
   *
   * @throws Error if the result is a failure
   */
  get value(): T {
    if (!this._isSuccess) {
      throw new Error(
        `Cannot access value of a failed Result. Error: ${this._error?.message}`,
      );
    }
    return this._value as T;
  }

  /**
   * Returns the error.
   * Throws an Error if the result is a success.
   *
   * @throws Error if the result is a success
   */
  get error(): E {
    if (this._isSuccess) {
      throw new Error('Cannot access error of a successful Result.');
    }
    return this._error as E;
  }

  /**
   * Transforms the success value using the provided function.
   * If the result is a failure, the mapper is not called and
   * the error propagates unchanged.
   *
   * @param fn - The transformation function
   * @returns A new Result with the transformed value, or the original error
   *
   * @example
   * Result.ok(10).map(x => x * 2)         // Result.ok(20)
   * Result.fail(err).map(x => x * 2)      // Result.fail(err)
   */
  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this._isSuccess) {
      return Result.ok(fn(this._value as T));
    }
    return Result.fail(this._error as E);
  }

  /**
   * Chains another Result-returning operation.
   * If the result is a failure, the function is not called and
   * the error propagates unchanged.
   *
   * @param fn - A function that returns a new Result
   * @returns The result of the chained operation, or the original error
   *
   * @example
   * Result.ok(10).flatMap(x => Result.ok(x * 2))     // Result.ok(20)
   * Result.ok(10).flatMap(x => Result.fail(err))      // Result.fail(err)
   * Result.fail(err).flatMap(x => Result.ok(x * 2))   // Result.fail(err)
   */
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this._isSuccess) {
      return fn(this._value as T);
    }
    return Result.fail(this._error as E);
  }

  /**
   * Returns the success value if present, otherwise returns the default.
   *
   * @param defaultValue - The fallback value
   * @returns The success value or the default
   *
   * @example
   * Result.ok(42).getOrElse(0)       // 42
   * Result.fail(err).getOrElse(0)    // 0
   */
  getOrElse(defaultValue: T): T {
    return this._isSuccess ? (this._value as T) : defaultValue;
  }

  /**
   * Returns the success value or throws the contained error.
   * Useful when you know the result should be successful and want
   * to propagate the error as an exception (e.g., in tests).
   *
   * @returns The success value
   * @throws The contained error if the result is a failure
   *
   * @example
   * const value = result.getOrThrow(); // throws if failure
   */
  getOrThrow(): T {
    if (this._isSuccess) {
      return this._value as T;
    }
    throw this._error;
  }
}
