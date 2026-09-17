/**
 * Patch-lite fuzz harness: generates random TOML, applies in-place leaf edits,
 * runs patch(), and verifies the result re-parses to the edited object.
 *
 * patch-lite only accepts edits to existing scalar values, so the harness
 * mutates scalar leaves (string, number, bigint, boolean) and skips date/time
 * values, which it rejects by design. A second harness checks that structural
 * mutations always throw PatchLiteError instead of crashing or returning
 * partial output.
 *
 * Usage: npx tsx src/__tests__/fuzz-patch-lite.ts [--count N] [--seed SEED] [--mutations M]
 */
import { randomToml, SeededRandom } from './randomizer';
import { parse } from '../';
import { patch } from '../patch-lite-entry';
import { PatchLiteError } from '../diff-lite';
import { deepEqual } from './fuzz-patch';
import { stableStringify } from '../utils';

export type LitePath = Array<string | number>;

export interface PatchLiteFuzzResult {
  seed: number;
  mutations: number;
  status: 'ok' | 'patch-fail' | 'roundtrip-mismatch' | 'unstable' | 'no-rejection' | 'wrong-error' | 'error';
  error?: string;
  originalToml?: string;
  patchedToml?: string;
  modifiedObj?: unknown;
  reParsedObj?: unknown;
  editPaths?: string[];
}

// ─── Traversal helpers ───────────────────────────────────────────────────

function isScalarLeaf(value: unknown): boolean {
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'bigint' || type === 'boolean';
}

/**
 * Paths of every scalar leaf patch-lite can edit.
 * Date/time values are skipped: patch-lite rejects them by design.
 */
export function collectEditableLeaves(obj: unknown, prefix: LitePath = []): LitePath[] {
  if (prefix.length > 0 && isScalarLeaf(obj)) return [prefix];
  if (obj == null || typeof obj !== 'object' || obj instanceof Date) return [];

  if (Array.isArray(obj)) {
    const paths: LitePath[] = [];
    for (let index = 0; index < obj.length; index++) {
      paths.push(...collectEditableLeaves(obj[index], prefix.concat(index)));
    }
    return paths;
  }

  const paths: LitePath[] = [];
  for (const key of Object.keys(obj)) {
    paths.push(...collectEditableLeaves((obj as any)[key], prefix.concat(key)));
  }
  return paths;
}

/** Paths of every array value, used by the structural-rejection harness. */
export function collectArrayPaths(obj: unknown, prefix: LitePath = []): LitePath[] {
  if (obj == null || typeof obj !== 'object' || obj instanceof Date) return [];

  if (Array.isArray(obj)) {
    const paths: LitePath[] = prefix.length > 0 ? [prefix] : [];
    for (let index = 0; index < obj.length; index++) {
      paths.push(...collectArrayPaths(obj[index], prefix.concat(index)));
    }
    return paths;
  }

  const paths: LitePath[] = [];
  for (const key of Object.keys(obj)) {
    paths.push(...collectArrayPaths((obj as any)[key], prefix.concat(key)));
  }
  return paths;
}

export function getAt(obj: any, path: LitePath): any {
  let current = obj;
  for (const segment of path) current = current?.[segment];
  return current;
}

export function setAt(obj: any, path: LitePath, value: unknown): void {
  let current = obj;
  for (let index = 0; index < path.length - 1; index++) current = current[path[index]];
  current[path[path.length - 1]] = value;
}

// ─── Replacement value generator ─────────────────────────────────────────

// Chosen to exercise every branch of the lite value encoder: basic string
// escaping, control characters, astral characters, integers, floats, negative
// zero, non-finite numbers and bigints.
const HOSTILE_STRINGS = [
  '',
  'plain',
  'with "quotes"',
  'back\\slash',
  'line\nbreak',
  'tab\there',
  'carriage\rreturn',
  'control\u0000chars',
  'delete\u007fchar',
  'unicode ✔ 😀',
  "literal 'quotes'",
  '"""triple"""',
  "'''triple'''"
];

function randomEditValue(rng: SeededRandom): unknown {
  const roll = rng.next();
  if (roll < 0.35) return rng.pick(HOSTILE_STRINGS);
  if (roll < 0.5) return rng.nextRange(-5000, 5000);
  if (roll < 0.65) {
    switch (rng.nextInt(5)) {
      case 0: return (rng.next() * 20000) - 10000;
      case 1: return -0;
      case 2: return Infinity;
      case 3: return -Infinity;
      default: return NaN;
    }
  }
  if (roll < 0.8) return rng.chance(0.5);

  // Beyond the safe integer range so the value stays a bigint through parse().
  const magnitude = BigInt(rng.nextRange(1, 9)) * 10n ** BigInt(rng.nextRange(16, 20));
  return rng.chance(0.5) ? magnitude : -magnitude;
}

// ─── Edit round-trip harness ─────────────────────────────────────────────

function failed(
  result: PatchLiteFuzzResult,
  status: PatchLiteFuzzResult['status'],
  error: string
): PatchLiteFuzzResult {
  return { ...result, status, error };
}

export function fuzzOneLite(seed: number, mutationCount: number): PatchLiteFuzzResult {
  const result: PatchLiteFuzzResult = { seed, mutations: mutationCount, status: 'ok' };

  try {
    const source = randomToml({ seed }).toml;

    let original: any;
    try {
      original = parse(source);
    } catch {
      // The randomizer can emit TOML edge cases parse() rejects; only cases
      // where parsing succeeds are interesting for a patch round-trip.
      return result;
    }

    const leaves = collectEditableLeaves(original);
    if (leaves.length === 0) return result;

    const rng = new SeededRandom(seed + mutationCount * 1000000);
    // Mutate the parsed object in place. patch-lite re-parses the source itself,
    // so there is no need for a clone, and cloning would corrupt date/time
    // values whose precision is finer than a millisecond.
    const updated = original;
    const editPaths: string[] = [];
    const used = new Set<string>();

    let attempts = 0;
    while (editPaths.length < mutationCount && attempts < mutationCount * 20) {
      attempts++;
      const path = rng.pick(leaves);
      const key = JSON.stringify(path);
      if (used.has(key)) continue;
      used.add(key);
      setAt(updated, path, randomEditValue(rng));
      editPaths.push(path.join('.'));
    }

    if (editPaths.length === 0) return result;

    const context = { originalToml: source, modifiedObj: updated, editPaths };

    let patched: string;
    try {
      patched = patch(source, updated);
    } catch (e: any) {
      return failed({ ...result, ...context }, 'patch-fail', `patch() threw: ${e.message}`);
    }

    let reParsed: any;
    try {
      reParsed = parse(patched);
    } catch (e: any) {
      return failed(
        { ...result, ...context, patchedToml: patched },
        'roundtrip-mismatch',
        `re-parse failed: ${e.message}`
      );
    }

    if (!deepEqual(updated, reParsed)) {
      return failed(
        { ...result, ...context, patchedToml: patched, reParsedObj: reParsed },
        'roundtrip-mismatch',
        'Objects differ after patch-lite round-trip'
      );
    }

    // Applying the same edit to the already-patched output must be a no-op.
    const again = patch(patched, updated);
    if (again !== patched) {
      return failed(
        { ...result, ...context, patchedToml: patched },
        'unstable',
        'Re-applying the same edit changed the output'
      );
    }

    return { ...result, editPaths };
  } catch (e: any) {
    return failed(result, 'error', `Unexpected: ${e.message}\n${e.stack}`);
  }
}

// ─── Structural rejection harness ────────────────────────────────────────

type RejectionCheck = { kind: 'ok' } | { kind: 'no-rejection' | 'wrong-error'; message: string };

function checkRejection(run: () => unknown): RejectionCheck {
  try {
    run();
  } catch (e: any) {
    if (e instanceof PatchLiteError) return { kind: 'ok' };
    return {
      kind: 'wrong-error',
      message: `expected PatchLiteError, got ${e?.constructor?.name ?? typeof e}: ${e?.message}`
    };
  }
  return { kind: 'no-rejection', message: 'expected PatchLiteError, but patch() returned normally' };
}

/**
 * Applies structural mutations (added/removed keys, container replacement,
 * added array elements, array reordering) to a random document and asserts
 * that each one is rejected with a PatchLiteError.
 */
export function fuzzRejectsLite(seed: number): PatchLiteFuzzResult {
  const result: PatchLiteFuzzResult = { seed, mutations: 0, status: 'ok' };

  try {
    const source = randomToml({ seed }).toml;

    let original: any;
    try {
      original = parse(source);
    } catch {
      return result;
    }
    if (original == null || typeof original !== 'object') return result;

    const report = (
      check: RejectionCheck,
      label: string,
      modifiedObj: unknown
    ): PatchLiteFuzzResult | undefined => {
      if (check.kind === 'ok') return undefined;
      return failed(
        { ...result, originalToml: source, modifiedObj },
        check.kind,
        `${label}: ${check.message}`
      );
    };

    // Each variant is parsed fresh from the source rather than cloned, so the
    // values match what patch-lite computes internally.

    // Added key.
    const withAdded = parse(source);
    let addedKey = '__lite_added__';
    while (addedKey in withAdded) addedKey += '_';
    withAdded[addedKey] = 1;

    let failure = report(checkRejection(() => patch(source, withAdded)), 'added key', withAdded);
    if (failure) return failure;

    // Removed key.
    const keys = Object.keys(original);
    if (keys.length > 0) {
      const withRemoved = parse(source);
      delete withRemoved[keys[0]];
      failure = report(checkRejection(() => patch(source, withRemoved)), 'removed key', withRemoved);
      if (failure) return failure;
    }

    // Scalar replaced by a container.
    const leaves = collectEditableLeaves(original);
    if (leaves.length > 0) {
      const retyped = parse(source);
      setAt(retyped, leaves[0], { nested: 1 });
      failure = report(checkRejection(() => patch(source, retyped)), 'container replacement', retyped);
      if (failure) return failure;
    }

    // Array length change and array reordering.
    const arrays = collectArrayPaths(original);
    if (arrays.length > 0) {
      const arrayPath = arrays[0];
      const originalArray = getAt(original, arrayPath);

      const longer = parse(source);
      const longerArray = getAt(longer, arrayPath);
      longerArray.push(originalArray.length > 0 ? originalArray[0] : 1);
      failure = report(checkRejection(() => patch(source, longer)), 'array append', longer);
      if (failure) return failure;

      // Only meaningful when swapping the first two elements actually changes
      // the order under the comparator's own stable form.
      if (
        originalArray.length >= 2 &&
        stableStringify(originalArray[0]) !== stableStringify(originalArray[1])
      ) {
        const swapped = parse(source);
        const swappedArray = getAt(swapped, arrayPath);
        const first = swappedArray[0];
        swappedArray[0] = swappedArray[1];
        swappedArray[1] = first;
        failure = report(checkRejection(() => patch(source, swapped)), 'array reorder', swapped);
        if (failure) return failure;
      }
    }

    return result;
  } catch (e: any) {
    return failed(result, 'error', `Unexpected: ${e.message}\n${e.stack}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const param = (name: string, def: number) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? parseInt(args[index + 1], 10) : def;
  };
  const count = param('count', 2000);
  const startSeed = param('seed', 0);
  const mutations = param('mutations', 3);

  console.log(`Patch-lite fuzzing ${count} seeds (${mutations} edits each)...`);

  const failures: PatchLiteFuzzResult[] = [];
  let edited = 0;

  for (let index = 0; index < count; index++) {
    const seed = startSeed + index;

    const edits = fuzzOneLite(seed, mutations);
    if (edits.status !== 'ok') {
      failures.push(edits);
      console.log(`\nFAIL [seed=${seed}] edits: ${edits.status} - ${edits.error}`);
      console.log(`Edits: ${edits.editPaths?.join(', ')}`);
    } else if (edits.editPaths && edits.editPaths.length > 0) {
      edited++;
    }

    const rejections = fuzzRejectsLite(seed);
    if (rejections.status !== 'ok') {
      failures.push(rejections);
      console.log(`\nFAIL [seed=${seed}] rejections: ${rejections.status} - ${rejections.error}`);
    }
  }

  console.log(`\n${count} seeds, ${edited} with edits applied, ${failures.length} failure(s)`);

  if (failures.length > 0) {
    console.log(`Failure seeds: ${failures.map(failure => failure.seed).join(', ')}`);
    process.exit(1);
  }
}

// Only run the CLI fuzz loop when executed directly, so tests can import the
// helpers without side effects.
if (import.meta.main) {
  main();
}
