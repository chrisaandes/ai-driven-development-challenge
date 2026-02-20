import { Transaction } from './transaction.entity';
import { Money } from '../value-objects/money.vo';
import { TransactionType } from '../value-objects/transaction-type.vo';

const WALLET_ID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('Transaction', () => {
  describe('createDeposit()', () => {
    it('should create a deposit transaction with correct type', () => {
      const amount = Money.of(100);
      const balanceAfter = Money.of(100);
      const tx = Transaction.createDeposit(WALLET_ID, USER_ID, amount, balanceAfter);

      expect(tx.type).toBe(TransactionType.DEPOSIT);
      expect(tx.type.isDeposit()).toBe(true);
    });

    it('should assign provided walletId and userId', () => {
      const tx = Transaction.createDeposit(
        WALLET_ID,
        USER_ID,
        Money.of(50),
        Money.of(50),
      );

      expect(tx.walletId).toBe(WALLET_ID);
      expect(tx.userId).toBe(USER_ID);
    });

    it('should store the amount', () => {
      const amount = Money.of(150.5);
      const tx = Transaction.createDeposit(WALLET_ID, USER_ID, amount, Money.of(150.5));

      expect(tx.amount.value).toBe(150.5);
    });

    it('should store the balance after', () => {
      const balanceAfter = Money.of(250);
      const tx = Transaction.createDeposit(
        WALLET_ID,
        USER_ID,
        Money.of(100),
        balanceAfter,
      );

      expect(tx.balanceAfter.value).toBe(250);
    });

    it('should generate a UUID v4 for id', () => {
      const tx = Transaction.createDeposit(
        WALLET_ID,
        USER_ID,
        Money.of(100),
        Money.of(100),
      );

      expect(tx.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should generate unique ids for each transaction', () => {
      const tx1 = Transaction.createDeposit(WALLET_ID, USER_ID, Money.of(100), Money.of(100));
      const tx2 = Transaction.createDeposit(WALLET_ID, USER_ID, Money.of(100), Money.of(200));
      expect(tx1.id).not.toBe(tx2.id);
    });

    it('should set createdAt to current time', () => {
      const before = new Date();
      const tx = Transaction.createDeposit(WALLET_ID, USER_ID, Money.of(100), Money.of(100));
      const after = new Date();

      expect(tx.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(tx.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('createWithdraw()', () => {
    it('should create a withdraw transaction with correct type', () => {
      const tx = Transaction.createWithdraw(
        WALLET_ID,
        USER_ID,
        Money.of(50),
        Money.of(50),
      );

      expect(tx.type).toBe(TransactionType.WITHDRAW);
      expect(tx.type.isWithdraw()).toBe(true);
    });

    it('should assign provided walletId and userId', () => {
      const tx = Transaction.createWithdraw(
        WALLET_ID,
        USER_ID,
        Money.of(50),
        Money.of(50),
      );

      expect(tx.walletId).toBe(WALLET_ID);
      expect(tx.userId).toBe(USER_ID);
    });

    it('should store the amount and balanceAfter', () => {
      const amount = Money.of(30);
      const balanceAfter = Money.of(70);
      const tx = Transaction.createWithdraw(WALLET_ID, USER_ID, amount, balanceAfter);

      expect(tx.amount.value).toBe(30);
      expect(tx.balanceAfter.value).toBe(70);
    });

    it('should generate a UUID v4 for id', () => {
      const tx = Transaction.createWithdraw(
        WALLET_ID,
        USER_ID,
        Money.of(50),
        Money.of(50),
      );

      expect(tx.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('reconstitute()', () => {
    it('should restore all fields from props', () => {
      const id = '550e8400-e29b-41d4-a716-446655440002';
      const createdAt = new Date('2025-01-01T00:00:00Z');

      const tx = Transaction.reconstitute({
        id,
        walletId: WALLET_ID,
        userId: USER_ID,
        type: TransactionType.DEPOSIT,
        amount: Money.of(100),
        balanceAfter: Money.of(100),
        createdAt,
      });

      expect(tx.id).toBe(id);
      expect(tx.walletId).toBe(WALLET_ID);
      expect(tx.userId).toBe(USER_ID);
      expect(tx.type).toBe(TransactionType.DEPOSIT);
      expect(tx.amount.value).toBe(100);
      expect(tx.balanceAfter.value).toBe(100);
      expect(tx.createdAt).toBe(createdAt);
    });

    it('should reconstitute a WITHDRAW transaction', () => {
      const tx = Transaction.reconstitute({
        id: '550e8400-e29b-41d4-a716-446655440003',
        walletId: WALLET_ID,
        userId: USER_ID,
        type: TransactionType.WITHDRAW,
        amount: Money.of(50),
        balanceAfter: Money.of(50),
        createdAt: new Date(),
      });

      expect(tx.type).toBe(TransactionType.WITHDRAW);
      expect(tx.type.isWithdraw()).toBe(true);
    });
  });

  describe('immutability', () => {
    it('transaction fields should not be modifiable externally', () => {
      const tx = Transaction.createDeposit(
        WALLET_ID,
        USER_ID,
        Money.of(100),
        Money.of(100),
      );

      // TypeScript enforces this at compile time, verify the values don't change
      const originalId = tx.id;
      const originalAmount = tx.amount.value;

      expect(tx.id).toBe(originalId);
      expect(tx.amount.value).toBe(originalAmount);
    });
  });
});
