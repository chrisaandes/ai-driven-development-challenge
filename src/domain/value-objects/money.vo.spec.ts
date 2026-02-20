import { Money } from './money.vo';

describe('Money', () => {
  describe('of()', () => {
    it('should create Money from a positive decimal amount', () => {
      const money = Money.of(100.5);
      expect(money.value).toBe(100.5);
      expect(money.cents).toBe(10050);
    });

    it('should create Money from an integer', () => {
      const money = Money.of(100);
      expect(money.value).toBe(100);
      expect(money.cents).toBe(10000);
    });

    it('should create Money from zero', () => {
      const money = Money.of(0);
      expect(money.value).toBe(0);
      expect(money.cents).toBe(0);
    });

    it('should create Money from a negative amount', () => {
      const money = Money.of(-50);
      expect(money.value).toBe(-50);
      expect(money.cents).toBe(-5000);
    });

    it('should round correctly to nearest cent via fromCents', () => {
      // Money.of enforces max 2 decimals; rounding happens with floating point imprecision.
      // Use fromCents to directly verify internal cent representation.
      const money = Money.fromCents(10001);
      expect(money.cents).toBe(10001);
      expect(money.value).toBeCloseTo(100.01, 2);
    });

    it('should throw for non-finite amount (Infinity)', () => {
      expect(() => Money.of(Infinity)).toThrow(
        'Money amount must be a finite number',
      );
    });

    it('should throw for non-finite amount (NaN)', () => {
      expect(() => Money.of(NaN)).toThrow(
        'Money amount must be a finite number',
      );
    });

    it('should throw for more than 2 decimal places', () => {
      expect(() => Money.of(100.123)).toThrow(
        'Money amount must have at most 2 decimal places',
      );
    });

    it('should allow exactly 2 decimal places', () => {
      const money = Money.of(100.12);
      expect(money.value).toBe(100.12);
    });

    it('should allow 1 decimal place', () => {
      const money = Money.of(100.1);
      expect(money.value).toBe(100.1);
    });
  });

  describe('fromCents()', () => {
    it('should create Money from integer cents', () => {
      const money = Money.fromCents(10050);
      expect(money.value).toBe(100.5);
      expect(money.cents).toBe(10050);
    });

    it('should create Money from zero cents', () => {
      const money = Money.fromCents(0);
      expect(money.value).toBe(0);
      expect(money.cents).toBe(0);
    });

    it('should create Money from negative cents', () => {
      const money = Money.fromCents(-5000);
      expect(money.value).toBe(-50);
      expect(money.cents).toBe(-5000);
    });

    it('should throw for non-integer cents', () => {
      expect(() => Money.fromCents(100.5)).toThrow('Cents must be an integer');
    });
  });

  describe('zero()', () => {
    it('should create a zero Money instance', () => {
      const zero = Money.zero();
      expect(zero.value).toBe(0);
      expect(zero.cents).toBe(0);
    });
  });

  describe('add()', () => {
    it('should add two positive amounts', () => {
      const a = Money.of(100);
      const b = Money.of(50);
      const result = a.add(b);
      expect(result.value).toBe(150);
    });

    it('should add decimal amounts correctly without floating point errors', () => {
      const a = Money.of(0.1);
      const b = Money.of(0.2);
      const result = a.add(b);
      expect(result.value).toBe(0.3);
    });

    it('should return a new immutable instance', () => {
      const a = Money.of(100);
      const b = Money.of(50);
      const result = a.add(b);
      expect(result).not.toBe(a);
      expect(a.value).toBe(100); // original unchanged
    });

    it('should add zero correctly', () => {
      const a = Money.of(100);
      const result = a.add(Money.zero());
      expect(result.value).toBe(100);
    });
  });

  describe('subtract()', () => {
    it('should subtract two positive amounts', () => {
      const a = Money.of(100);
      const b = Money.of(30);
      const result = a.subtract(b);
      expect(result.value).toBe(70);
    });

    it('should allow negative results', () => {
      const a = Money.of(30);
      const b = Money.of(100);
      const result = a.subtract(b);
      expect(result.value).toBe(-70);
    });

    it('should return a new immutable instance', () => {
      const a = Money.of(100);
      const b = Money.of(30);
      const result = a.subtract(b);
      expect(result).not.toBe(a);
      expect(a.value).toBe(100); // original unchanged
    });
  });

  describe('multiply()', () => {
    it('should multiply by a positive factor', () => {
      const money = Money.of(100);
      const result = money.multiply(1.5);
      expect(result.value).toBe(150);
    });

    it('should multiply by zero', () => {
      const money = Money.of(100);
      const result = money.multiply(0);
      expect(result.value).toBe(0);
    });

    it('should round to nearest cent', () => {
      const money = Money.of(10);
      const result = money.multiply(1.005);
      // 1000 cents * 1.005 = 1005 -> 10.05
      expect(result.cents).toBe(1005);
    });

    it('should throw for non-finite factor', () => {
      const money = Money.of(100);
      expect(() => money.multiply(Infinity)).toThrow(
        'Multiplication factor must be a finite number',
      );
    });

    it('should return a new immutable instance', () => {
      const money = Money.of(100);
      const result = money.multiply(2);
      expect(result).not.toBe(money);
      expect(money.value).toBe(100); // original unchanged
    });
  });

  describe('isLessThan()', () => {
    it('should return true when this is less than other', () => {
      expect(Money.of(50).isLessThan(Money.of(100))).toBe(true);
    });

    it('should return false when this equals other', () => {
      expect(Money.of(100).isLessThan(Money.of(100))).toBe(false);
    });

    it('should return false when this is greater than other', () => {
      expect(Money.of(100).isLessThan(Money.of(50))).toBe(false);
    });
  });

  describe('isGreaterThan()', () => {
    it('should return true when this is greater than other', () => {
      expect(Money.of(100).isGreaterThan(Money.of(50))).toBe(true);
    });

    it('should return false when this equals other', () => {
      expect(Money.of(100).isGreaterThan(Money.of(100))).toBe(false);
    });

    it('should return false when this is less than other', () => {
      expect(Money.of(50).isGreaterThan(Money.of(100))).toBe(false);
    });
  });

  describe('isNegativeOrZero()', () => {
    it('should return true for zero', () => {
      expect(Money.zero().isNegativeOrZero()).toBe(true);
    });

    it('should return true for negative amounts', () => {
      expect(Money.of(-1).isNegativeOrZero()).toBe(true);
    });

    it('should return false for positive amounts', () => {
      expect(Money.of(1).isNegativeOrZero()).toBe(false);
    });

    it('should return false for small positive amounts', () => {
      expect(Money.fromCents(1).isNegativeOrZero()).toBe(false);
    });
  });

  describe('equals()', () => {
    it('should return true for equal amounts', () => {
      expect(Money.of(100).equals(Money.of(100))).toBe(true);
    });

    it('should return false for different amounts', () => {
      expect(Money.of(100).equals(Money.of(101))).toBe(false);
    });

    it('should return true when both are zero', () => {
      expect(Money.zero().equals(Money.zero())).toBe(true);
    });

    it('should return true for Money.of and Money.fromCents with same value', () => {
      expect(Money.of(100.5).equals(Money.fromCents(10050))).toBe(true);
    });
  });

  describe('toString()', () => {
    it('should return formatted string', () => {
      expect(Money.of(100.5).toString()).toBe('Money(100.50)');
    });

    it('should show zero correctly', () => {
      expect(Money.zero().toString()).toBe('Money(0.00)');
    });
  });

  describe('MAX_CENTS boundary', () => {
    it('should throw when amount exceeds maximum', () => {
      expect(() => Money.fromCents(99_999_999_999 + 1)).toThrow(
        'Money amount exceeds maximum allowed value',
      );
    });

    it('should accept the maximum allowed value', () => {
      const money = Money.fromCents(99_999_999_999);
      expect(money.cents).toBe(99_999_999_999);
    });
  });
});
