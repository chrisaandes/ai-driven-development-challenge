import { TransactionType } from './transaction-type.vo';

describe('TransactionType', () => {
  describe('static instances', () => {
    it('should have DEPOSIT static instance', () => {
      expect(TransactionType.DEPOSIT).toBeDefined();
      expect(TransactionType.DEPOSIT.value).toBe('DEPOSIT');
    });

    it('should have WITHDRAW static instance', () => {
      expect(TransactionType.WITHDRAW).toBeDefined();
      expect(TransactionType.WITHDRAW.value).toBe('WITHDRAW');
    });

    it('DEPOSIT and WITHDRAW should be different instances', () => {
      expect(TransactionType.DEPOSIT).not.toBe(TransactionType.WITHDRAW);
    });
  });

  describe('fromString()', () => {
    it('should return DEPOSIT for "DEPOSIT"', () => {
      const type = TransactionType.fromString('DEPOSIT');
      expect(type).toBe(TransactionType.DEPOSIT);
    });

    it('should return WITHDRAW for "WITHDRAW"', () => {
      const type = TransactionType.fromString('WITHDRAW');
      expect(type).toBe(TransactionType.WITHDRAW);
    });

    it('should be case-insensitive for deposit', () => {
      const type = TransactionType.fromString('deposit');
      expect(type).toBe(TransactionType.DEPOSIT);
    });

    it('should be case-insensitive for withdraw', () => {
      const type = TransactionType.fromString('withdraw');
      expect(type).toBe(TransactionType.WITHDRAW);
    });

    it('should be case-insensitive for mixed case', () => {
      const type = TransactionType.fromString('Deposit');
      expect(type).toBe(TransactionType.DEPOSIT);
    });

    it('should throw for invalid type', () => {
      expect(() => TransactionType.fromString('INVALID')).toThrow(
        'Invalid transaction type: "INVALID"',
      );
    });

    it('should throw for empty string', () => {
      expect(() => TransactionType.fromString('')).toThrow(
        'Invalid transaction type',
      );
    });
  });

  describe('isDeposit()', () => {
    it('should return true for DEPOSIT', () => {
      expect(TransactionType.DEPOSIT.isDeposit()).toBe(true);
    });

    it('should return false for WITHDRAW', () => {
      expect(TransactionType.WITHDRAW.isDeposit()).toBe(false);
    });
  });

  describe('isWithdraw()', () => {
    it('should return true for WITHDRAW', () => {
      expect(TransactionType.WITHDRAW.isWithdraw()).toBe(true);
    });

    it('should return false for DEPOSIT', () => {
      expect(TransactionType.DEPOSIT.isWithdraw()).toBe(false);
    });
  });

  describe('equals()', () => {
    it('should return true for same type', () => {
      expect(TransactionType.DEPOSIT.equals(TransactionType.DEPOSIT)).toBe(true);
    });

    it('should return true for fromString result vs static instance', () => {
      const type = TransactionType.fromString('DEPOSIT');
      expect(TransactionType.DEPOSIT.equals(type)).toBe(true);
    });

    it('should return false for different types', () => {
      expect(TransactionType.DEPOSIT.equals(TransactionType.WITHDRAW)).toBe(false);
    });
  });

  describe('toString()', () => {
    it('should return "DEPOSIT" for deposit type', () => {
      expect(TransactionType.DEPOSIT.toString()).toBe('DEPOSIT');
    });

    it('should return "WITHDRAW" for withdraw type', () => {
      expect(TransactionType.WITHDRAW.toString()).toBe('WITHDRAW');
    });
  });

  describe('value getter', () => {
    it('should return the underlying string for DEPOSIT', () => {
      expect(TransactionType.DEPOSIT.value).toBe('DEPOSIT');
    });

    it('should return the underlying string for WITHDRAW', () => {
      expect(TransactionType.WITHDRAW.value).toBe('WITHDRAW');
    });
  });
});
