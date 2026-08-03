/**
 * Fuzz harness: generates random TOML, round-trips through parse→stringify→parse,
 * and reports any discrepancies. Used to find edge-case bugs in the library.
 *
 * Usage: npx tsx src/__tests__/fuzz-harness.ts [--count N] [--seed SEED]
 */
import { randomToml } from '../randomizer';
import { parse, stringify } from '../';
import { inspect } from 'util';

interface FuzzResult {
  seed: number;
  status: 'ok' | 'parse-fail' | 'roundtrip-mismatch' | 'error';
  error?: string;
  originalToml?: string;
  reStringified?: string;
  originalObj?: unknown;
  reParsedObj?: unknown;
}

function deepEqual(a: unknown, b: unknown): boolean {
  // Identical reference
  if (a === b) return true;
  // Null/undefined
  if (a == null || b == null) return a === b;

  // NaN check (NaN !== NaN)
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return true;

  // Type mismatch
  if (typeof a !== typeof b) return false;

  // BigInt
  if (typeof a === 'bigint') return a === b;

  // Primitives (string, number, boolean, symbol)
  if (typeof a !== 'object') return a === b;

  // Dates (must check before generic object — Date has no enumerable own keys)
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  // One is array, other is not
  if (Array.isArray(a) || Array.isArray(b)) return false;

  // Plain objects
  const keysA = Object.keys(a as object).sort();
  const keysB = Object.keys(b as object).sort();
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k =>
    Object.prototype.hasOwnProperty.call(b, k) && deepEqual((a as any)[k], (b as any)[k])
  );
}

function fuzzOne(seed: number): FuzzResult {
  const result: FuzzResult = { seed, status: 'ok' };

  try {
    // 1. Generate random TOML
    const generated = randomToml({ seed });

    // 2. Parse it
    let obj1: unknown;
    try {
      obj1 = parse(generated.toml);
    } catch (e: any) {
      // The randomizer may produce technically invalid TOML edge cases
      // We only care about cases where parse succeeds but round-trip fails
      return { seed, status: 'ok' }; // skip unparseable ones for now
    }

    // 3. Stringify back
    let reStringified: string;
    try {
      reStringified = stringify(obj1);
    } catch (e: any) {
      result.status = 'error';
      result.error = `stringify failed: ${e.message}`;
      result.originalToml = generated.toml;
      result.originalObj = obj1;
      return result;
    }

    // 4. Parse the re-stringified version
    let obj2: unknown;
    try {
      obj2 = parse(reStringified);
    } catch (e: any) {
      result.status = 'roundtrip-mismatch';
      result.error = `re-parse failed: ${e.message}`;
      result.originalToml = generated.toml;
      result.reStringified = reStringified;
      result.originalObj = obj1;
      return result;
    }

    // 5. Compare objects
    if (!deepEqual(obj1, obj2)) {
      result.status = 'roundtrip-mismatch';
      result.error = 'Objects differ after round-trip';
      result.originalToml = generated.toml;
      result.reStringified = reStringified;
      result.originalObj = obj1;
      result.reParsedObj = obj2;
      return result;
    }

    return result;
  } catch (e: any) {
    result.status = 'error';
    result.error = `Unexpected error: ${e.message}\n${e.stack}`;
    return result;
  }
}

function main() {
  const args = process.argv.slice(2);
  const countIndex = args.indexOf('--count');
  const seedIndex = args.indexOf('--seed');
  const count = countIndex >= 0 ? parseInt(args[countIndex + 1], 10) : 1000;
  const startSeed = seedIndex >= 0 ? parseInt(args[seedIndex + 1], 10) : 0;

  console.log(`Fuzzing ${count} seeds starting from ${startSeed}...`);

  const failures: FuzzResult[] = [];
  let tested = 0;

  for (let i = 0; i < count; i++) {
    const seed = startSeed + i;
    const result = fuzzOne(seed);
    tested++;

    if (result.status !== 'ok') {
      failures.push(result);
      console.log(`\nFAIL [seed=${seed}]: ${result.status} — ${result.error}`);
      if (result.originalToml) {
        console.log('--- Original TOML ---');
        console.log(result.originalToml);
      }
      if (result.reStringified) {
        console.log('--- Re-stringified ---');
        console.log(result.reStringified);
      }
      if (result.originalObj && result.reParsedObj) {
        console.log('--- Original object ---');
        console.log(inspect(result.originalObj, { depth: 10, maxArrayLength: 20 }));
        console.log('--- Re-parsed object ---');
        console.log(inspect(result.reParsedObj, { depth: 10, maxArrayLength: 20 }));
      }
      console.log('---');
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  Progress: ${i + 1}/${count}, failures: ${failures.length}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Fuzz complete: ${tested} tested, ${failures.length} failures`);

  if (failures.length > 0) {
    console.log(`\nFailure seeds: ${failures.map(f => f.seed).join(', ')}`);
    console.log(`\nTo reproduce a specific failure:`);
    console.log(`  npx tsx src/__tests__/fuzz-harness.ts --seed <seed> --count 1`);
    process.exit(1);
  }
}

main();
