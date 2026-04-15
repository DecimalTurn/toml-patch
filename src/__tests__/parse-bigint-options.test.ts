import { parse } from '../index';

describe('parse() integersAsBigInt option', () => {
  const safeInt = 'x = 42';
  const maxSafe = `x = ${Number.MAX_SAFE_INTEGER}`; // 9007199254740991
  const beyondSafe = 'x = 9223372036854775807'; // i64 max
  const negBeyondSafe = 'x = -9223372036854775808'; // i64 min
  const hexLiteral = 'x = 0xFF';
  const octLiteral = 'x = 0o77';
  const binLiteral = 'x = 0b1010';
  const withUnderscore = 'x = 1_000_000';
  const floatVal = 'x = 3.14';
  const mixed = 'a = 1\nb = 9223372036854775807';

  // ──────────────────────────────────────────────────────────────
  // Default mode: 'asNeeded'
  // ──────────────────────────────────────────────────────────────
  describe("default mode ('asNeeded')", () => {
    it('returns number for safe integer', () => {
      expect(parse(safeInt).x).toBe(42);
      expect(typeof parse(safeInt).x).toBe('number');
    });

    it('returns number for MAX_SAFE_INTEGER', () => {
      expect(parse(maxSafe).x).toBe(Number.MAX_SAFE_INTEGER);
      expect(typeof parse(maxSafe).x).toBe('number');
    });

    it('returns bigint for i64 max', () => {
      expect(parse(beyondSafe).x).toBe(BigInt('9223372036854775807'));
      expect(typeof parse(beyondSafe).x).toBe('bigint');
    });

    it('returns bigint for i64 min', () => {
      expect(parse(negBeyondSafe).x).toBe(BigInt('-9223372036854775808'));
      expect(typeof parse(negBeyondSafe).x).toBe('bigint');
    });

    it('returns number for hex literal in safe range', () => {
      expect(parse(hexLiteral).x).toBe(255);
      expect(typeof parse(hexLiteral).x).toBe('number');
    });

    it('returns number for octal literal', () => {
      expect(parse(octLiteral).x).toBe(63);
    });

    it('returns number for binary literal', () => {
      expect(parse(binLiteral).x).toBe(10);
    });

    it('handles underscores in integer', () => {
      expect(parse(withUnderscore).x).toBe(1_000_000);
    });

    it('leaves floats unaffected', () => {
      expect(parse(floatVal).x).toBe(3.14);
      expect(typeof parse(floatVal).x).toBe('number');
    });

    it('mixes number and bigint in same document', () => {
      const result = parse(mixed);
      expect(result.a).toBe(1);
      expect(typeof result.a).toBe('number');
      expect(result.b).toBe(BigInt('9223372036854775807'));
      expect(typeof result.b).toBe('bigint');
    });

    it('explicit asNeeded matches default', () => {
      expect(parse(beyondSafe, { integersAsBigInt: 'asNeeded' }).x).toBe(BigInt('9223372036854775807'));
      expect(parse(safeInt, { integersAsBigInt: 'asNeeded' }).x).toBe(42);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // integersAsBigInt: true
  // ──────────────────────────────────────────────────────────────
  describe('integersAsBigInt: true', () => {
    it('returns bigint for safe integer', () => {
      expect(parse(safeInt, { integersAsBigInt: true }).x).toBe(BigInt(42));
      expect(typeof parse(safeInt, { integersAsBigInt: true }).x).toBe('bigint');
    });

    it('returns bigint for MAX_SAFE_INTEGER', () => {
      expect(parse(maxSafe, { integersAsBigInt: true }).x).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    });

    it('returns bigint for i64 max', () => {
      expect(parse(beyondSafe, { integersAsBigInt: true }).x).toBe(BigInt('9223372036854775807'));
    });

    it('returns bigint for hex literal', () => {
      expect(parse(hexLiteral, { integersAsBigInt: true }).x).toBe(BigInt(255));
    });

    it('returns bigint for all integers in arrays', () => {
      const result = parse('x = [1, 2, 3]', { integersAsBigInt: true });
      expect(result.x).toEqual([BigInt(1), BigInt(2), BigInt(3)]);
    });

    it('returns bigint for integers in inline tables', () => {
      const result = parse('x = { a = 1, b = 2 }', { integersAsBigInt: true });
      expect(result.x.a).toBe(BigInt(1));
      expect(result.x.b).toBe(BigInt(2));
    });

    it('leaves floats unaffected', () => {
      expect(parse(floatVal, { integersAsBigInt: true }).x).toBe(3.14);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // integersAsBigInt: false
  // ──────────────────────────────────────────────────────────────
  describe('integersAsBigInt: false', () => {
    it('returns number for safe integer', () => {
      expect(parse(safeInt, { integersAsBigInt: false }).x).toBe(42);
      expect(typeof parse(safeInt, { integersAsBigInt: false }).x).toBe('number');
    });

    it('returns number for i64 max (lossy)', () => {
      const result = parse(beyondSafe, { integersAsBigInt: false });
      expect(typeof result.x).toBe('number');
      // Value is lossy — just check type
    });

    it('returns number for hex literal', () => {
      expect(parse(hexLiteral, { integersAsBigInt: false }).x).toBe(255);
    });

    it('leaves floats unaffected', () => {
      expect(parse(floatVal, { integersAsBigInt: false }).x).toBe(3.14);
    });
  });
});
