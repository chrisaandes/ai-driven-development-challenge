/**
 * Input for the GetBalance use case.
 */
export class GetBalanceInput {
  /** UUID of the user whose balance to retrieve. */
  userId: string;
}

/**
 * Output from the GetBalance use case.
 */
export class GetBalanceOutput {
  /** UUID of the user. */
  userId: string;

  /** Current wallet balance. */
  balance: number;

  /** When the wallet was last updated. */
  lastUpdated: Date;
}
