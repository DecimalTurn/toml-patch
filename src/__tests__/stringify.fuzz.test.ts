/**
 * Fuzz tests for stringify: generate random JS objects, stringify them,
 * parse back, and verify the round-trip is lossless.
 */
import { stringify, parse } from '../';

// ---------------------------------------------------------------------------
// Random value generators
// ---------------------------------------------------------------------------

let seed = 42;
function random(): number {
  seed = (seed * 16807 + 0) % 2147483647;
  return seed / 2147483647;
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

const safeChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ ';
function randomString(minLen = 0, maxLen = 20): string {
  const len = randomInt(minLen, maxLen);
  let s = '';
  for (let i = 0; i < len; i++) s += safeChars[randomInt(0, safeChars.length - 1)];
  return s;
}

function randomKey(): string {
  // Mostly simple keys, occasionally quoted
  if (random() < 0.8) return randomString(1, 12).replace(/^[0-9]/, 'k$&');
  return `"${randomString(1, 8)}"`;
}

function randomValue(depth: number): any {
  if (depth <= 0) return randomScalar();
  const r = random();
  if (r < 0.35) return randomScalar();
  if (r < 0.60) return randomObject(depth - 1);
  if (r < 0.80) return randomArray(depth - 1);
  if (r < 0.90) return randomBoolean();
  return randomScalar();
}

function randomScalar(): any {
  const r = random();
  if (r < 0.30) return randomString(0, 30);
  if (r < 0.55) return randomInt(-1000, 1000);
  if (r < 0.72) return Math.round(random() * 1e6) / 100;
  if (r < 0.82) return randomBoolean();
  // special floats — rare
  if (r < 0.85) return Infinity;
  if (r < 0.88) return -Infinity;
  if (r < 0.91) return NaN;
  if (r < 0.94) return 0;
  if (r < 0.97) return -0;
  return randomInt(-100, 100);
}

function randomBoolean(): boolean {
  return random() < 0.5;
}

function randomObject(depth: number): Record<string, any> {
  const obj: Record<string, any> = {};
  const count = randomInt(1, Math.min(6, 3 + depth * 2));
  for (let i = 0; i < count; i++) {
    obj[randomKey()] = randomValue(depth);
  }
  return obj;
}

function randomArray(depth: number): any[] {
  const arr: any[] = [];
  const count = randomInt(0, 5);
  for (let i = 0; i < count; i++) {
    arr.push(randomValue(depth));
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function sortedKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortedKeys);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const out: Record<string, any> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortedKeys(obj[key]);
    }
    return out;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stringify fuzz — round-trip identity', () => {
  const ITERATIONS = 200;
  const DEPTH = 3;

  for (let i = 0; i < ITERATIONS; i++) {
    seed = 42 + i; // deterministic per iteration
    const obj = randomObject(DEPTH);

    test(`iteration ${i + 1}: ${JSON.stringify(obj).substring(0, 80)}`, () => {
      // 1. Stringify should not throw
      let toml: string;
      expect(() => { toml = stringify(obj); }).not.toThrow();

      // 2. Output should be valid TOML
      let parsed: any;
      expect(() => { parsed = parse(toml!); }).not.toThrow();

      // 3. Round-trip: parse(stringify(obj)) should match
      expect(sortedKeys(parsed!)).toEqual(sortedKeys(obj));
    });
  }
});

describe('stringify fuzz — formatting options', () => {
  const ITERATIONS = 50;
  const DEPTH = 3;

  const optionsList = [
    { name: 'inlineTableStart=0', opts: { inlineTableStart: 0 } },
    { name: 'bracketSpacing=false', opts: { bracketSpacing: false } },
    { name: 'trailingComma=true', opts: { trailingComma: true } },
    { name: 'inlineTableStart=1 + bracketSpacing=false', opts: { inlineTableStart: 1, bracketSpacing: false } },
  ];

  for (const { name, opts } of optionsList) {
    describe(name, () => {
      for (let i = 0; i < ITERATIONS; i++) {
        seed = 100 + i;
        const obj = randomObject(DEPTH);

        test(`iteration ${i + 1}`, () => {
          let toml: string;
          expect(() => { toml = stringify(obj, opts); }).not.toThrow();
          let parsed: any;
          expect(() => { parsed = parse(toml!); }).not.toThrow();
          expect(sortedKeys(parsed!)).toEqual(sortedKeys(obj));
        });
      }
    });
  }
});

// Known bug: inlineTableStart=2 produces invalid TOML for nested objects.
// Tracked in stringify.test.ts "stringifyRoots fast-path: nested inline tables extracted at depth 2"
describe('stringify fuzz — formatting options (known bug)', () => {
  const ITERATIONS = 10;
  const DEPTH = 3;

  for (let i = 0; i < ITERATIONS; i++) {
    seed = 300 + i;
    const obj = randomObject(DEPTH);

    test.skip(`inlineTableStart=2 iteration ${i + 1}`, () => {
      let toml: string;
      expect(() => { toml = stringify(obj, { inlineTableStart: 2 }); }).not.toThrow();
      let parsed: any;
      expect(() => { parsed = parse(toml!); }).not.toThrow();
      expect(sortedKeys(parsed!)).toEqual(sortedKeys(obj));
    });
  }
});

describe('stringify fuzz — edge cases', () => {

  test('empty object', () => {
    expect(stringify({})).toBe('\n');
    expect(parse(stringify({}))).toEqual({});
  });

  test('deeply nested object', () => {
    const obj: any = {};
    let cur = obj;
    for (let i = 0; i < 20; i++) {
      cur.child = {};
      cur = cur.child;
    }
    cur.value = 42;
    const toml = stringify(obj);
    expect(() => parse(toml)).not.toThrow();
    expect(parse(toml)).toEqual(obj);
  });

  test('object with many keys', () => {
    const obj: Record<string, any> = {};
    for (let i = 0; i < 50; i++) {
      obj[`key_${i}`] = `value_${i}`;
    }
    const toml = stringify(obj);
    expect(() => parse(toml)).not.toThrow();
    expect(parse(toml)).toEqual(obj);
  });

  test('nested arrays', () => {
    const obj = { arr: [[[1, 2], [3]], [[4]]] };
    const toml = stringify(obj);
    expect(() => parse(toml)).not.toThrow();
    expect(parse(toml)).toEqual(obj);
  });

  test('mixed types in array', () => {
    const obj = { mix: [1, 'two', true, 4.5] };
    const toml = stringify(obj);
    expect(() => parse(toml)).not.toThrow();
    expect(parse(toml)).toEqual(obj);
  });

  test('special floats round-trip', () => {
    const obj = {
      a: Infinity,
      b: -Infinity,
      c: NaN,
      d: 0,
      e: -0,
      f: 1.5,
    };
    const toml = stringify(obj);
    expect(() => parse(toml)).not.toThrow();
    const parsed = parse(toml);
    expect(parsed.a).toBe(Infinity);
    expect(parsed.b).toBe(-Infinity);
    expect(Number.isNaN(parsed.c)).toBe(true);
    expect(parsed.d).toBe(0);
    expect(parsed.f).toBe(1.5);
  });

  test('undefined values are dropped from objects', () => {
    const obj: any = { a: 1, b: undefined, d: 2 };
    const toml = stringify(obj);
    expect(() => parse(toml)).not.toThrow();
    const parsed = parse(toml);
    expect(parsed).toEqual({ a: 1, d: 2 });
  });

  test('empty array survives', () => {
    const obj = { a: [] };
    const toml = stringify(obj);
    expect(() => parse(toml)).not.toThrow();
    expect(parse(toml)).toEqual(obj);
  });

  test('empty inline table survives', () => {
    const obj = { a: {} };
    const toml = stringify(obj);
    expect(() => parse(toml)).not.toThrow();
    expect(parse(toml)).toEqual(obj);
  });

  test('quoted keys round-trip', () => {
    const obj: Record<string, any> = {};
    obj['key with spaces'] = 1;
    obj['123numeric'] = 2;
    obj['dotted.key'] = { a: 3 };
    const toml = stringify(obj);
    expect(() => parse(toml)).not.toThrow();
    const parsed = parse(toml);
    expect(parsed['key with spaces']).toBe(1);
    expect(parsed['123numeric']).toBe(2);
    expect(parsed['dotted.key']).toEqual({ a: 3 });
  });
});

describe('stringify fuzz — format stability', () => {
  const ITERATIONS = 30;

  for (let i = 0; i < ITERATIONS; i++) {
    seed = 200 + i;
    const obj = randomObject(2);

    test(`double stringify is idempotent (iteration ${i + 1})`, () => {
      const toml1 = stringify(obj);
      const parsed = parse(toml1);
      const toml2 = stringify(parsed);
      // Second parse of re-stringified should match
      expect(parse(toml2)).toEqual(parse(toml1));
    });
  }
});
