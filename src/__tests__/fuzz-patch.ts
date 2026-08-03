/**
 * Patch fuzz harness: generates random TOML, randomly mutates the JS object,
 * applies patch(), and verifies the result round-trips correctly.
 *
 * Usage: npx tsx src/__tests__/fuzz-patch.ts [--count N] [--seed SEED] [--mutations M]
 */
import { randomToml, RandomizerOptions } from '../randomizer';
import { parse, patch } from '../';
import { inspect } from 'util';

// ─── Mutation helpers ────────────────────────────────────────────────────

type JsonValue =
  | string | number | bigint | boolean | null
  | JsonValue[]
  | { [key: string]: JsonValue }
  | Date;

interface RandomMutation {
  /** Where to apply the mutation */
  path: (string | number)[];
  /** What kind of mutation */
  kind: 'add-key' | 'delete-key' | 'change-value' | 'change-type' | 'add-array-item' | 'remove-array-item';
  /** New value (for add-key, change-value, change-type, add-array-item) */
  newValue?: JsonValue;
}

/**
 * Collect all mutable paths in an object tree.
 * Returns paths where mutations can be applied.
 */
function collectPaths(
  obj: unknown,
  prefix: (string | number)[] = []
): (string | number)[][] {
  const paths: (string | number)[][] = [];

  if (obj == null) return paths;
  if (typeof obj !== 'object') return paths;
  // Don't recurse into Date objects — they're leaf values in TOML
  if (obj instanceof Date) return paths;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      paths.push([...prefix, i]);
      paths.push(...collectPaths(obj[i], [...prefix, i]));
    }
    paths.push([...prefix, obj.length]);
  } else {
    const keys = Object.keys(obj);
    for (const key of keys) {
      paths.push([...prefix, key]);
      paths.push(...collectPaths((obj as any)[key], [...prefix, key]));
    }
  }

  return paths;
}

/**
 * Get value at path.
 */
function getAt(obj: unknown, path: (string | number)[]): unknown {
  let current = obj;
  for (const seg of path) {
    if (current == null) return undefined;
    if (typeof seg === 'number' && Array.isArray(current)) {
      current = current[seg];
    } else if (typeof seg === 'string' && typeof current === 'object') {
      current = (current as any)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Set value at path (creates intermediate objects as needed).
 */
function setAt(obj: any, path: (string | number)[], value: unknown): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    const next = path[i + 1];
    if (typeof next === 'number') {
      if (!Array.isArray(current[seg])) current[seg] = [];
      current = current[seg];
    } else {
      if (current[seg] == null || typeof current[seg] !== 'object' || Array.isArray(current[seg])) {
        current[seg] = {};
      }
      current = current[seg];
    }
  }
  const last = path[path.length - 1];
  if (typeof last === 'number' && Array.isArray(current)) {
    current[last] = value;
  } else if (typeof last === 'string' && typeof current === 'object') {
    current[last] = value;
  }
}

/**
 * Delete at path.
 */
function deleteAt(obj: any, path: (string | number)[]): void {
  if (path.length === 0) return;
  const parent = getAt(obj, path.slice(0, -1));
  const key = path[path.length - 1];
  if (parent == null) return;
  if (typeof key === 'number' && Array.isArray(parent)) {
    parent.splice(key, 1);
  } else if (typeof key === 'string' && typeof parent === 'object') {
    delete parent[key];
  }
}

// ─── Deep clone (handles Date subclasses, BigInt, arrays) ────────────────

function deepClone(obj: unknown): unknown {
  if (obj == null || typeof obj !== 'object') return obj;
  if (typeof obj === 'bigint') return obj;

  // Date subclasses from toml-patch — use originalFormat if available,
  // otherwise fall back to getTime()
  if (obj instanceof Date) {
    const format = (obj as any).originalFormat;
    if (format && typeof format === 'string') {
      try {
        const Ctor = obj.constructor as new (value: string) => Date;
        return new Ctor(format);
      } catch { /* fall through */ }
    }
    return new Date(obj.getTime());
  }

  if (Array.isArray(obj)) return obj.map(deepClone);

  // Preserve null prototype
  const proto = Object.getPrototypeOf(obj);
  const cloned: any = proto === null ? Object.create(null) : {};
  for (const key of Object.keys(obj)) {
    cloned[key] = deepClone((obj as any)[key]);
  }
  return cloned;
}

// ─── Deep equal ──────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'bigint') return a === b;
  if (typeof a !== 'object') return a === b;

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;

  const keysA = Object.keys(a as object).sort();
  const keysB = Object.keys(b as object).sort();
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k =>
    Object.prototype.hasOwnProperty.call(b, k) && deepEqual((a as any)[k], (b as any)[k])
  );
}

// ─── Random value generator for mutations ────────────────────────────────

function randomMutationValue(): JsonValue {
  const r = Math.random();
  if (r < 0.20) {
    // random string
    const len = Math.floor(Math.random() * 20) + 1;
    let s = '';
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  if (r < 0.45) return Math.floor(Math.random() * 10000) - 5000;
  if (r < 0.60) return Math.random() * 10000 - 5000;
  if (r < 0.75) return Math.random() > 0.5;
  if (r < 0.85) return new Date(Date.UTC(2000 + Math.floor(Math.random() * 50), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1));
  if (r < 0.95) {
    const len = Math.floor(Math.random() * 4);
    return Array.from({ length: len }, () => randomMutationValue());
  }
  // inline table
  const keys = Math.floor(Math.random() * 3) + 1;
  const obj: any = {};
  for (let i = 0; i < keys; i++) {
    obj['k' + Math.floor(Math.random() * 100)] = randomMutationValue();
  }
  return obj;
}

// ─── Mutation generator ──────────────────────────────────────────────────

function generateMutation(obj: unknown): RandomMutation | null {
  const paths = collectPaths(obj);

  // Filter: don't mutate paths that point to arrays (mutate array elements instead)
  // Also skip paths that would be root-level arrays
  const mutablePaths = paths.filter(p => {
    if (p.length === 0) return false;
    const parent = p.length > 0 ? getAt(obj, p.slice(0, -1)) : obj;
    if (Array.isArray(parent)) {
      // Parent is array → can delete or change element, or add new element
      return true;
    }
    return true;
  });

  if (mutablePaths.length === 0) return null;

  const path = mutablePaths[Math.floor(Math.random() * mutablePaths.length)];
  const parent = path.length > 0 ? getAt(obj, path.slice(0, -1)) : obj;
  const existing = getAt(obj, path);
  const isArrayParent = Array.isArray(parent);
  const key = path[path.length - 1];

  // Choose mutation kind based on context
  const roll = Math.random();

  if (isArrayParent && typeof key === 'number') {
    // Array context
    if (existing !== undefined && roll < 0.3) {
      // Remove array item
      return { path, kind: 'remove-array-item' };
    }
    if (roll < 0.6) {
      // Change array item
      return { path, kind: 'change-value', newValue: randomMutationValue() };
    }
    // Add array item
    return { path, kind: 'add-array-item', newValue: randomMutationValue() };
  }

  // Object context
  if (existing !== undefined && typeof existing === 'object' && !(existing instanceof Date) && roll < 0.1) {
    // Don't delete/overwrite objects — too destructive
    return null;
  }

  if (existing !== undefined && roll < 0.3) {
    // Delete key
    return { path, kind: 'delete-key' };
  }
  if (existing !== undefined && roll < 0.4) {
    // Change type
    return { path, kind: 'change-type', newValue: randomMutationValue() };
  }
  if (existing !== undefined) {
    // Change value
    return { path, kind: 'change-value', newValue: randomMutationValue() };
  }
  // Add key
  return { path, kind: 'add-key', newValue: randomMutationValue() };
}

function applyMutation(obj: any, mutation: RandomMutation): void {
  switch (mutation.kind) {
    case 'add-key':
      setAt(obj, mutation.path, mutation.newValue);
      break;
    case 'delete-key':
      deleteAt(obj, mutation.path);
      break;
    case 'change-value':
    case 'change-type':
      setAt(obj, mutation.path, mutation.newValue);
      break;
    case 'add-array-item':
      // path is to the array itself or to a new index
      addToArray(obj, mutation.path, mutation.newValue);
      break;
    case 'remove-array-item':
      deleteAt(obj, mutation.path);
      break;
  }
}

function addToArray(obj: any, path: (string | number)[], value: unknown): void {
  const arr = getAt(obj, path.slice(0, -1));
  if (Array.isArray(arr)) {
    const idx = path[path.length - 1] as number;
    if (idx === arr.length) {
      arr.push(value);
    } else {
      arr.splice(idx, 0, value);
    }
  }
}

// ─── Fuzz runner ─────────────────────────────────────────────────────────

interface PatchFuzzResult {
  seed: number;
  mutations: number;
  status: 'ok' | 'patch-fail' | 'roundtrip-mismatch' | 'error';
  error?: string;
  originalToml?: string;
  patchedToml?: string;
  modifiedObj?: unknown;
  reParsedObj?: unknown;
  mutationDescs?: string[];
}

function fuzzOne(
  seed: number,
  mutationCount: number
): PatchFuzzResult {
  const result: PatchFuzzResult = { seed, mutations: mutationCount, status: 'ok' };

  try {
    // 1. Generate random TOML and parse it
    const generated = randomToml({ seed });

    let obj1: any;
    try {
      obj1 = parse(generated.toml);
    } catch {
      return { seed, mutations: mutationCount, status: 'ok' }; // skip unparseable
    }

    // 2. Deep clone
    let obj2 = deepClone(obj1) as any;

    // 3. Apply mutations
    const mutationDescs: string[] = [];
    for (let i = 0; i < mutationCount; i++) {
      const mutation = generateMutation(obj2);
      if (!mutation) break;
      applyMutation(obj2, mutation);
      mutationDescs.push(`${mutation.kind} at ${mutation.path.join('.') || 'root'}`);
    }

    if (mutationDescs.length === 0) {
      return { seed, mutations: mutationCount, status: 'ok' };
    }

    // 4. Apply patch
    let patchedToml: string;
    try {
      patchedToml = patch(generated.toml, obj2);
    } catch (e: any) {
      result.status = 'patch-fail';
      result.error = `patch() threw: ${e.message}`;
      result.originalToml = generated.toml;
      result.modifiedObj = obj2;
      result.mutationDescs = mutationDescs;
      return result;
    }

    // 5. Parse the patched result
    let reParsed: any;
    try {
      reParsed = parse(patchedToml);
    } catch (e: any) {
      result.status = 'roundtrip-mismatch';
      result.error = `re-parse failed: ${e.message}`;
      result.originalToml = generated.toml;
      result.patchedToml = patchedToml;
      result.modifiedObj = obj2;
      result.mutationDescs = mutationDescs;
      return result;
    }

    // 6. Compare
    if (!deepEqual(obj2, reParsed)) {
      result.status = 'roundtrip-mismatch';
      result.error = 'Objects differ after patch round-trip';
      result.originalToml = generated.toml;
      result.patchedToml = patchedToml;
      result.modifiedObj = obj2;
      result.reParsedObj = reParsed;
      result.mutationDescs = mutationDescs;
      return result;
    }

    return result;
  } catch (e: any) {
    result.status = 'error';
    result.error = `Unexpected: ${e.message}\n${e.stack}`;
    return result;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const param = (name: string, def: number) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? parseInt(args[i + 1], 10) : def;
  };
  const count = param('count', 200);
  const startSeed = param('seed', 0);
  const mutations = param('mutations', 3);

  console.log(`Patch-fuzzing ${count} seeds (${mutations} mutations each)...`);

  const failures: PatchFuzzResult[] = [];
  let tested = 0;
  let skipped = 0;

  for (let i = 0; i < count; i++) {
    const seed = startSeed + i;
    const result = fuzzOne(seed, mutations);

    if (result.status === 'ok' && result.mutationDescs && result.mutationDescs.length > 0) {
      tested++;
    } else if (result.status === 'ok') {
      skipped++;
    } else {
      tested++;
      failures.push(result);
    }

    if (result.status !== 'ok') {
      console.log(`\nFAIL [seed=${seed}]: ${result.status} — ${result.error}`);
      if (result.mutationDescs) {
        console.log('Mutations:');
        result.mutationDescs.forEach(d => console.log(`  ${d}`));
      }
      if (result.originalToml) {
        console.log('--- Original TOML ---');
        console.log(result.originalToml.substring(0, 600));
      }
      if (result.patchedToml) {
        console.log('--- Patched TOML ---');
        console.log(result.patchedToml.substring(0, 600));
      }
      if (result.modifiedObj && result.reParsedObj) {
        console.log('--- Expected ---');
        console.log(inspect(result.modifiedObj, { depth: 8, maxArrayLength: 10 }).substring(0, 600));
        console.log('--- Got ---');
        console.log(inspect(result.reParsedObj, { depth: 8, maxArrayLength: 10 }).substring(0, 600));
      }
      console.log('---');
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  Progress: ${i + 1}/${count}, tested: ${tested}, failures: ${failures.length}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Patch fuzz complete: ${tested} tested, ${skipped} skipped, ${failures.length} failures`);

  if (failures.length > 0) {
    console.log(`\nFailure seeds: ${failures.map(f => f.seed).join(', ')}`);
    process.exit(1);
  }
}

main();
