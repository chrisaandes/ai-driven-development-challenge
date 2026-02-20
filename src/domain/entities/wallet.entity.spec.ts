import { Wallet } from './wallet.entity';
import { Money } from '../value-objects/money.vo';
import { InvalidAmountError } from '../errors/invalid-amount.error';
import { InsufficientBalanceError } from '../errors/insufficient-balance.error';
import { TransactionProcessedEvent } from '../events/transaction-processed.event';
import { Transaction } from './transaction.entity';

const USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('Wallet', () => {
  describe('create()', () => {
    it('should create a wallet with zero balance', () => {
      const wallet = Wallet.create(USER_ID);
      expect(wallet.balance.value).toBe(0);
    });

    it('should assign the given userId', () => {
      const wallet = Wallet.create(USER_ID);
      expect(wallet.userId).toBe(USER_ID);
    });

    it('should generate a UUID v4 for id', () => {
      const wallet = Wallet.create(USER_ID);
      expect(wallet.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should initialize with version 1', () => {
      const wallet = Wallet.create(USER_ID);
      expect(wallet.version).toBe(1);
    });

    it('should set createdAt and updatedAt to current time', () => {
      const before = new Date();
      const wallet = Wallet.create(USER_ID);
      const after = new Date();

      expect(wallet.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(wallet.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(wallet.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(wallet.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should generate unique IDs for different wallets', () => {
      const wallet1 = Wallet.create(USER_ID);
      const wallet2 = Wallet.create(USER_ID);
      expect(wallet1.id).not.toBe(wallet2.id);
    });
  });

  describe('reconstitute()', () => {
    it('should restore all fields from props', () => {
      const id = '550e8400-e29b-41d4-a716-446655440001';
      const balance = Money.of(250.5);
      const version = 5;
      const createdAt = new Date('2025-01-01T00:00:00Z');
      const updatedAt = new Date('2025-06-01T00:00:00Z');

      const wallet = Wallet.reconstitute({
        id,
        userId: USER_ID,
        balance,
        version,
        createdAt,
        updatedAt,
      });

      expect(wallet.id).toBe(id);
      expect(wallet.userId).toBe(USER_ID);
      expect(wallet.balance.value).toBe(250.5);
      expect(wallet.version).toBe(version);
      expect(wallet.createdAt).toBe(createdAt);
      expect(wallet.updatedAt).toBe(updatedAt);
    });

    it('should not collect domain events during reconstitution', () => {
      const wallet = Wallet.reconstitute({
        id: '550e8400-e29b-41d4-a716-446655440001',
        userId: USER_ID,
        balance: Money.of(100),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const events = wallet.pullDomainEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('deposit()', () => {
    it('should increase balance by the deposit amount', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      expect(wallet.balance.value).toBe(100);
    });

    it('should return a successful Result with a Transaction', () => {
      const wallet = Wallet.create(USER_ID);
      const result = wallet.deposit(Money.of(100));

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Transaction);
    });

    it('should return transaction with correct type (DEPOSIT)', () => {
      const wallet = Wallet.create(USER_ID);
      const result = wallet.deposit(Money.of(100));

      expect(result.value.type.isDeposit()).toBe(true);
    });

    it('should return transaction with the correct amount', () => {
      const wallet = Wallet.create(USER_ID);
      const result = wallet.deposit(Money.of(150.5));

      expect(result.value.amount.value).toBe(150.5);
    });

    it('should return transaction with balanceAfter reflecting the new balance', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      const result = wallet.deposit(Money.of(50));

      expect(result.value.balanceAfter.value).toBe(150);
    });

    it('should accumulate multiple deposits', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      wallet.deposit(Money.of(50));
      wallet.deposit(Money.of(25));
      expect(wallet.balance.value).toBe(175);
    });

    it('should fail for zero amount', () => {
      const wallet = Wallet.create(USER_ID);
      const result = wallet.deposit(Money.of(0));

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAmountError);
    });

    it('should fail for negative amount', () => {
      const wallet = Wallet.create(USER_ID);
      const result = wallet.deposit(Money.of(-50));

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAmountError);
    });

    it('should not modify balance on failed deposit', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100)); // successful
      wallet.deposit(Money.of(-10)); // should fail
      expect(wallet.balance.value).toBe(100);
    });

    it('should collect a TransactionProcessedEvent', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));

      const events = wallet.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TransactionProcessedEvent);
    });

    it('domain event should have correct transaction data', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));

      const events = wallet.pullDomainEvents();
      const event = events[0] as TransactionProcessedEvent;

      expect(event.type).toBe('DEPOSIT');
      expect(event.amount).toBe(100);
      expect(event.balanceAfter).toBe(100);
      expect(event.walletId).toBe(wallet.id);
      expect(event.userId).toBe(USER_ID);
    });
  });

  describe('withdraw()', () => {
    it('should decrease balance by the withdrawal amount', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      wallet.withdraw(Money.of(30));
      expect(wallet.balance.value).toBe(70);
    });

    it('should return a successful Result with a Transaction', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      const result = wallet.withdraw(Money.of(30));

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Transaction);
    });

    it('should return transaction with correct type (WITHDRAW)', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      const result = wallet.withdraw(Money.of(30));

      expect(result.value.type.isWithdraw()).toBe(true);
    });

    it('should allow withdrawing the exact balance', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      const result = wallet.withdraw(Money.of(100));

      expect(result.isSuccess).toBe(true);
      expect(wallet.balance.value).toBe(0);
    });

    it('should return balanceAfter reflecting the new balance', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      const result = wallet.withdraw(Money.of(30));

      expect(result.value.balanceAfter.value).toBe(70);
    });

    it('should fail with InsufficientBalanceError when amount exceeds balance', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      const result = wallet.withdraw(Money.of(150));

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InsufficientBalanceError);
    });

    it('should carry currentBalance and requestedAmount in InsufficientBalanceError', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      const result = wallet.withdraw(Money.of(150));

      const error = result.error as InsufficientBalanceError;
      expect(error.currentBalance.value).toBe(100);
      expect(error.requestedAmount.value).toBe(150);
    });

    it('should fail for zero amount', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      const result = wallet.withdraw(Money.of(0));

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAmountError);
    });

    it('should fail for negative amount', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      const result = wallet.withdraw(Money.of(-50));

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAmountError);
    });

    it('should not modify balance on failed withdrawal', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      wallet.withdraw(Money.of(200)); // should fail
      expect(wallet.balance.value).toBe(100);
    });

    it('should fail withdrawal from empty wallet', () => {
      const wallet = Wallet.create(USER_ID);
      const result = wallet.withdraw(Money.of(50));

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InsufficientBalanceError);
    });

    it('should collect a TransactionProcessedEvent', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(200));
      wallet.pullDomainEvents(); // clear deposit event
      wallet.withdraw(Money.of(50));

      const events = wallet.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TransactionProcessedEvent);
    });

    it('domain event should have correct withdraw data', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(200));
      wallet.pullDomainEvents(); // clear deposit event
      wallet.withdraw(Money.of(50));

      const events = wallet.pullDomainEvents();
      const event = events[0] as TransactionProcessedEvent;

      expect(event.type).toBe('WITHDRAW');
      expect(event.amount).toBe(50);
      expect(event.balanceAfter).toBe(150);
    });
  });

  describe('pullDomainEvents()', () => {
    it('should return empty array initially', () => {
      const wallet = Wallet.create(USER_ID);
      expect(wallet.pullDomainEvents()).toHaveLength(0);
    });

    it('should drain events after pulling', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));

      const events1 = wallet.pullDomainEvents();
      const events2 = wallet.pullDomainEvents();

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(0);
    });

    it('should collect one event per deposit', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(100));
      wallet.deposit(Money.of(50));

      const events = wallet.pullDomainEvents();
      expect(events).toHaveLength(2);
    });

    it('should collect events from both deposits and withdrawals', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(200));
      wallet.withdraw(Money.of(50));

      const events = wallet.pullDomainEvents();
      expect(events).toHaveLength(2);
    });

    it('should not collect events for failed operations', () => {
      const wallet = Wallet.create(USER_ID);
      wallet.deposit(Money.of(-100)); // fails - no event
      wallet.withdraw(Money.of(50)); // fails - no event

      const events = wallet.pullDomainEvents();
      expect(events).toHaveLength(0);
    });
  });
});
