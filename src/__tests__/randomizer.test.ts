import { randomToml, SeededRandom } from '../randomizer';
import { parse } from '../';

describe('SeededRandom', () => {
  test('should produce deterministic sequence with same seed', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
  });

  test('should produce different sequence with different seed', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(99);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    expect(seq1).not.toEqual(seq2);
  });

  test('next() should return values in [0, 1)', () => {
    const rng = new SeededRandom(123);

    for (let i = 0; i < 100; i++) {
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  test('nextInt should return values in [0, max)', () => {
    const rng = new SeededRandom(456);

    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(5);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(5);
    }
  });

  test('nextRange should return values in [min, max]', () => {
    const rng = new SeededRandom(789);

    for (let i = 0; i < 100; i++) {
      const val = rng.nextRange(3, 7);
      expect(val).toBeGreaterThanOrEqual(3);
      expect(val).toBeLessThanOrEqual(7);
    }
  });

  test('pick should select elements from array', () => {
    const rng = new SeededRandom(42);
    const arr = ['a', 'b', 'c'];

    for (let i = 0; i < 50; i++) {
      const val = rng.pick(arr);
      expect(arr).toContain(val);
    }
  });

  test('pickWeighted should respect weights', () => {
    const rng = new SeededRandom(42);
    const items = [
      { item: 'rare', weight: 1 },
      { item: 'common', weight: 100 }
    ];

    let rare = 0;
    let common = 0;
    for (let i = 0; i < 1000; i++) {
      const val = rng.pickWeighted(items);
      if (val === 'rare') rare++;
      else common++;
    }

    // Common should appear much more frequently
    expect(common).toBeGreaterThan(rare * 5);
  });
});

describe('randomToml', () => {
  test('should produce deterministic output with same seed', () => {
    const result1 = randomToml({ seed: 42 });
    const result2 = randomToml({ seed: 42 });

    expect(result1.toml).toBe(result2.toml);
    expect(result1.seed).toBe(42);
    expect(result2.seed).toBe(42);
  });

  test('should produce different output with different seed', () => {
    const result1 = randomToml({ seed: 42 });
    const result2 = randomToml({ seed: 99 });

    expect(result1.toml).not.toBe(result2.toml);
  });

  test('should produce parseable TOML (fixed seeds)', () => {
    const seeds = [1, 42, 123, 999, 7777, 12345, 54321, 100000];

    for (const seed of seeds) {
      const result = randomToml({ seed });
      expect(() => parse(result.toml)).not.toThrow(
        `Failed to parse TOML with seed ${seed}:\n${result.toml}`
      );
    }
  });

  test('should produce parseable TOML (random seeds, 50 iterations)', () => {
    for (let i = 0; i < 50; i++) {
      const result = randomToml();
      expect(() => parse(result.toml)).not.toThrow(
        `Failed to parse TOML with seed ${result.seed}:\n${result.toml}`
      );
    }
  });

  test('should produce parseable TOML with various options', () => {
    const optionsList = [
      { seed: 42, maxTables: 3, maxKeyValues: 5 },
      { seed: 100, maxDepth: 1, maxArrayLength: 3 },
      { seed: 200, maxTables: 20, maxKeyValues: 30, maxDepth: 2 },
      { seed: 300, maxStringLength: 10, maxKeyLength: 5 },
      { seed: 400, maxTables: 0 },
      { seed: 500, maxKeyValues: 1, maxTables: 1 }
    ];

    for (const opts of optionsList) {
      const result = randomToml(opts);
      expect(() => parse(result.toml)).not.toThrow(
        `Failed to parse TOML with options ${JSON.stringify(opts)}:\n${result.toml}`
      );
    }
  });

  test('should generate different node types', () => {
    // Run many iterations and ensure we see variety
    const foundTypes = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const result = randomToml();
      const toml = result.toml;

      if (toml.includes('"""')) foundTypes.add('ml-basic-string');
      if (toml.includes("'''")) foundTypes.add('ml-literal-string');
      if (toml.includes('0x')) foundTypes.add('hex-integer');
      if (toml.includes('0o')) foundTypes.add('octal-integer');
      if (toml.includes('0b')) foundTypes.add('binary-integer');
      if (toml.includes('inf')) foundTypes.add('float-inf');
      if (toml.includes('nan')) foundTypes.add('float-nan');
      if (toml.includes('e+') || toml.includes('e-')) foundTypes.add('float-exp');
      if (toml.includes('true') || toml.includes('false')) foundTypes.add('boolean');
      if (/\d{4}-\d{2}-\d{2}/.test(toml)) foundTypes.add('datetime');
      if (toml.includes('{')) foundTypes.add('inline-table');
      if (toml.includes('[') && toml.includes(']') && !toml.includes('[[')) {
        // Check for inline arrays (not table headers)
        const lines = toml.split('\n');
        for (const line of lines) {
          if (line.includes('= [') && !line.startsWith('[')) {
            foundTypes.add('inline-array');
            break;
          }
        }
      }
      if (toml.includes('[[')) foundTypes.add('table-array');
      if (/^\[[^\]]+\]$/m.test(toml)) foundTypes.add('table');
      if (toml.includes('#')) foundTypes.add('comment');
    }

    // We should see at least these common types
    expect(foundTypes.has('boolean')).toBe(true);
    expect(foundTypes.has('datetime')).toBe(true);
    expect(foundTypes.has('comment')).toBe(true);
    expect(foundTypes.has('ml-basic-string')).toBe(true);
  });

  test('should return seed for reproducibility', () => {
    const result = randomToml({ seed: 12345 });
    expect(result.seed).toBe(12345);
  });

  test('should generate seed when not provided', () => {
    const result = randomToml();
    expect(typeof result.seed).toBe('number');
    expect(Number.isInteger(result.seed)).toBe(true);
  });

  test('should return valid CST document structure', () => {
    const result = randomToml({ seed: 42 });
    const doc = result.document;

    expect(doc.type).toBe('Document');
    expect(Array.isArray(doc.items)).toBe(true);
    expect(doc.loc).toBeDefined();
    expect(doc.loc.start).toBeDefined();
    expect(doc.loc.end).toBeDefined();
  });
});
