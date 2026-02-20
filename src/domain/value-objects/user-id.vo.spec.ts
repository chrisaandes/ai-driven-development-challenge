import { UserId } from './user-id.vo';

const VALID_UUID_V4 = '550e8400-e29b-41d4-a716-446655440001';
const ANOTHER_VALID_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('UserId', () => {
  describe('generate()', () => {
    it('should generate a valid UUID v4', () => {
      const id = UserId.generate();
      expect(id.value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should generate unique IDs', () => {
      const id1 = UserId.generate();
      const id2 = UserId.generate();
      expect(id1.value).not.toBe(id2.value);
    });

    it('should return a UserId instance', () => {
      const id = UserId.generate();
      expect(id).toBeInstanceOf(UserId);
    });
  });

  describe('fromString()', () => {
    it('should create a UserId from a valid UUID v4', () => {
      const id = UserId.fromString(VALID_UUID_V4);
      expect(id.value).toBe(VALID_UUID_V4);
    });

    it('should accept uppercase UUID', () => {
      const upperUuid = VALID_UUID_V4.toUpperCase();
      const id = UserId.fromString(upperUuid);
      expect(id.value).toBe(upperUuid);
    });

    it('should throw for empty string', () => {
      expect(() => UserId.fromString('')).toThrow('Invalid user ID');
    });

    it('should throw for non-UUID string', () => {
      expect(() => UserId.fromString('not-a-uuid')).toThrow('Invalid user ID');
    });

    it('should throw for UUID v1 (not v4)', () => {
      const uuidV1 = '550e8400-e29b-11d4-a716-446655440000';
      expect(() => UserId.fromString(uuidV1)).toThrow('Invalid user ID');
    });

    it('should throw for UUID with wrong variant bits', () => {
      const wrongVariant = '550e8400-e29b-41d4-1716-446655440000';
      expect(() => UserId.fromString(wrongVariant)).toThrow('Invalid user ID');
    });
  });

  describe('value getter', () => {
    it('should return the underlying UUID string', () => {
      const id = UserId.fromString(VALID_UUID_V4);
      expect(id.value).toBe(VALID_UUID_V4);
    });
  });

  describe('equals()', () => {
    it('should return true for same UUID', () => {
      const id1 = UserId.fromString(VALID_UUID_V4);
      const id2 = UserId.fromString(VALID_UUID_V4);
      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different UUIDs', () => {
      const id1 = UserId.fromString(VALID_UUID_V4);
      const id2 = UserId.fromString(ANOTHER_VALID_UUID);
      expect(id1.equals(id2)).toBe(false);
    });

    it('should return true when comparing generated id with same string', () => {
      const generated = UserId.generate();
      const fromStr = UserId.fromString(generated.value);
      expect(generated.equals(fromStr)).toBe(true);
    });
  });

  describe('toString()', () => {
    it('should return the UUID string', () => {
      const id = UserId.fromString(VALID_UUID_V4);
      expect(id.toString()).toBe(VALID_UUID_V4);
    });
  });
});
