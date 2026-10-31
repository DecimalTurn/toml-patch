/**
 * Patch fuzz harness: generates random TOML, randomly mutates the JS object,
 * applies patch(), and verifies the result round-trips correctly.
 *
 * Usage: npx tsx src/__tests__/fuzz-patch.ts [--count N] [--seed SEED] [--mutations M]
 *
 * To inspect a single seed's TOML, format, mutations and output:
 *   npx tsx src/__tests__/inspect-fuzz-seed.ts <seed> [--mutations M]
 */
import { randomToml, SeededRandom } from './randomizer';
import { parse, patch, TomlFormat } from '../';
import { NodeType } from '../cst';
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
  } else if (typeof key === 'string' && typeof parent === 'object' && parent !== null) {
    delete (parent as Record<string, unknown>)[key];
  }
}

// ─── Deep clone (handles Date subclasses, BigInt, arrays) ────────────────

export function deepClone(obj: unknown): unknown {
  if (obj == null || typeof obj !== 'object') return obj;
  if (typeof obj === 'bigint') return obj;

  // Date subclasses from toml-patch — use originalFormat if available,
  // otherwise reconstruct through the subclass's own constructor so its
  // toISOString() override survives.
  //
  // `LocalDate` has no originalFormat property; falling back to
  // `new Date(getTime())` would produce a plain Date whose ISO form
  // (2057-08-11T00:00:00.000Z) differs from the LocalDate's own
  // (2057-08-11), making the library's diff treat an untouched value
  // as edited.
  if (obj instanceof Date) {
    const format = (obj as any).originalFormat;
    if (format && typeof format === 'string') {
      try {
        const Ctor = obj.constructor as new (value: string) => Date;
        return new Ctor(format);
      } catch { /* fall through */ }
    }
    if (obj.constructor !== Date) {
      try {
        const Ctor = obj.constructor as new (value: string) => Date;
        return new Ctor(obj.toISOString());
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

export function deepEqual(a: unknown, b: unknown): boolean {
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

/**
 * Like `deepEqual` but normalises values that formatting options can change:
 * - `truncateZeroTimeInDates`: converts Date objects to date-only ISO strings
 *   before comparing, since the patched TOML drops the zero time component.
 * - `newLine`: treats \r\n and \n as equivalent inside string values, since
 *   the patched TOML normalises ALL line endings — including multiline string
 *   content — to the requested style.  Only active when the option is set;
 *   without it the document keeps its original newlines and untouched
 *   strings are not rewritten.
 */
function deepEqualWithFormat(a: unknown, b: unknown, fmt?: Partial<TomlFormat>): boolean {
  const truncateDates = fmt?.truncateZeroTimeInDates === true;
  const normalizeNewlines = fmt?.newLine !== undefined;

  function normalise(val: unknown): unknown {
    if (val == null) return val;
    if (normalizeNewlines && typeof val === 'string') {
      return val.replace(/\r\n/g, '\n');
    }
    if (truncateDates && val instanceof Date) {
      // `truncateZeroTimeInDates` drops time when it's midnight UTC.
      // Re-parsing a date-only TOML value gives a LocalDate-like object,
      // so normalise both sides to a date-only ISO string for comparison.
      if (val.getUTCHours() === 0 && val.getUTCMinutes() === 0 &&
          val.getUTCSeconds() === 0 && val.getUTCMilliseconds() === 0) {
        const y = val.getUTCFullYear();
        const m = String(val.getUTCMonth() + 1).padStart(2, '0');
        const d = String(val.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return val.toISOString();
    }
    if (Array.isArray(val)) return val.map(normalise);
    if (val && typeof val === 'object' && !(val instanceof Date)) {
      const acc: Record<string, unknown> = {};
      for (const k of Object.keys(val as object)) {
        acc[k] = normalise((val as any)[k]);
      }
      return acc;
    }
    return val;
  }

  // Normalise both sides when the format would affect the comparison, then
  // use plain deepEqual on the normalised values.  When no normalising
  // options are active this degrades to a regular deepEqual.
  if (truncateDates || normalizeNewlines) {
    return deepEqual(normalise(a), normalise(b));
  }
  return deepEqual(a, b);
}

// ─── Random value generator for mutations ────────────────────────────────

/**
 * A date with a time of day and a random millisecond. Whole-second values can
 * never need more fractional digits than a source fraction wrote, so they
 * cannot catch an edit that truncates the value.
 */
function randomSubSecondDate(rng: SeededRandom): Date {
  return new Date(Date.UTC(
    2000 + rng.nextRange(0, 49),
    rng.nextRange(0, 11),
    rng.nextRange(1, 28),
    rng.nextRange(0, 23),
    rng.nextRange(0, 59),
    rng.nextRange(0, 59),
    rng.nextRange(0, 999)
  ));
}

function randomMutationValue(rng: SeededRandom, subSecondDates = false): JsonValue {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-';
  const roll = rng.next();
  if (roll < 0.20) {
    const len = rng.nextRange(1, 20);
    let s = '';
    for (let i = 0; i < len; i++) s += chars[rng.nextInt(chars.length)];
    return s;
  }
  if (roll < 0.45) return rng.nextRange(-5000, 5000);
  if (roll < 0.60) return (rng.next() * 10000) - 5000;
  if (roll < 0.75) return rng.chance(0.5);
  if (roll < 0.85) {
    if (subSecondDates) return randomSubSecondDate(rng);
    return new Date(Date.UTC(
      2000 + rng.nextRange(0, 49),
      rng.nextRange(0, 11),
      rng.nextRange(1, 28)
    ));
  }
  if (roll < 0.95) {
    const len = rng.nextRange(0, 3);
    return Array.from({ length: len }, () => randomMutationValue(rng, subSecondDates));
  }
  const keys = rng.nextRange(1, 3);
  const obj: any = {};
  for (let i = 0; i < keys; i++) {
    obj['k' + rng.nextRange(0, 99)] = randomMutationValue(rng, subSecondDates);
  }
  return obj;
}

// ─── Mutation generator ──────────────────────────────────────────────────

export function generateMutation(
  obj: unknown,
  rng: SeededRandom,
  subSecondDates = false,
  dateFocus = false
): RandomMutation | null {
  const paths = collectPaths(obj);

  const mutablePaths = paths.filter(p => {
    if (p.length === 0) return false;
    const parent = p.length > 0 ? getAt(obj, p.slice(0, -1)) : obj;
    if (Array.isArray(parent)) return true;
    return true;
  });

  if (mutablePaths.length === 0) return null;

  // Variant 4 spends most of its budget on date leaves. An untargeted draw
  // reaches one rarely, and even then only one value in ten is a date, so the
  // fraction path stayed untested no matter how many seeds were scanned.
  let candidates = mutablePaths;
  if (dateFocus && rng.chance(0.6)) {
    const datePaths = mutablePaths.filter(p => getAt(obj, p) instanceof Date);
    if (datePaths.length > 0) candidates = datePaths;
  }

  const path = candidates[rng.nextInt(candidates.length)];
  const parent = path.length > 0 ? getAt(obj, path.slice(0, -1)) : obj;
  const existing = getAt(obj, path);
  const isArrayParent = Array.isArray(parent);
  const key = path[path.length - 1];

  if (dateFocus && existing instanceof Date) {
    // Replace a date with another date: an added, removed or retyped key would
    // not exercise the fraction at all.
    return { path, kind: 'change-value', newValue: randomSubSecondDate(rng) };
  }

  const roll = rng.next();

  if (isArrayParent && typeof key === 'number') {
    if (existing !== undefined && roll < 0.3) {
      return { path, kind: 'remove-array-item' };
    }
    if (roll < 0.6) {
      return { path, kind: 'change-value', newValue: randomMutationValue(rng, subSecondDates) };
    }
    return { path, kind: 'add-array-item', newValue: randomMutationValue(rng, subSecondDates) };
  }

  if (existing !== undefined && typeof existing === 'object' && !(existing instanceof Date) && roll < 0.1) {
    return null;
  }

  if (existing !== undefined && roll < 0.3) {
    return { path, kind: 'delete-key' };
  }
  if (existing !== undefined && roll < 0.4) {
    return { path, kind: 'change-type', newValue: randomMutationValue(rng, subSecondDates) };
  }
  if (existing !== undefined) {
    return { path, kind: 'change-value', newValue: randomMutationValue(rng, subSecondDates) };
  }
  return { path, kind: 'add-key', newValue: randomMutationValue(rng, subSecondDates) };
}

export function applyMutation(obj: any, mutation: RandomMutation): void {
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

// ─── Random TomlFormat generator ─────────────────────────────────────────

export function randomTomlFormat(
  rng: SeededRandom,
  randomizeIndentWidth = false,
  randomizeMultiline = false,
  fullFormats = false
): Partial<TomlFormat> | undefined {
  // 50% chance: no format override (use library defaults)
  if (rng.chance(0.5)) return undefined;

  const format: Partial<TomlFormat> = {};

  // inlineTableStart: 0, 1, 2, or undefined (default 1)
  const itsRoll = rng.next();
  if (itsRoll < 0.25) format.inlineTableStart = 0;
  else if (itsRoll < 0.5) format.inlineTableStart = 1;
  else if (itsRoll < 0.75) format.inlineTableStart = 2;
  // else undefined → use default

  format.trailingComma = rng.chance(0.5);
  format.bracketSpacing = rng.chance(0.5);
  format.updateOrder = rng.chance(0.5);

  // trailingNewline: 0, 1, 2
  const tnRoll = rng.next();
  if (tnRoll < 0.33) format.trailingNewline = 0;
  else if (tnRoll < 0.66) format.trailingNewline = 1;
  else format.trailingNewline = 2;

  format.newLine = rng.chance(0.5) ? '\r\n' : '\n';
  format.leadingBom = rng.chance(0.3);
  format.truncateZeroTimeInDates = rng.chance(0.5);
  format.useTabsForIndentation = rng.chance(0.3);
  if (randomizeIndentWidth) format.indentWidth = rng.nextRange(1, 4);

  // minimumDecimals: mostly 0 (default), sometimes 1 or 2
  const mdRoll = rng.next();
  if (mdRoll >= 0.7 && mdRoll < 0.85) format.minimumDecimals = 1;
  else if (mdRoll >= 0.85) format.minimumDecimals = 2;

  if (randomizeMultiline) {
    const multilineModes = [false, true, 0, 1, 2, 'auto', 'parent'] as const;
    format.multilineTable = rng.pick(multilineModes);
    format.multilineArray = rng.pick(multilineModes);
  }

  // Variant 4 only: the options variants 1-3 never set. Drawn after the shared
  // options so a variant 1-3 format keeps consuming the same RNG sequence.
  if (fullFormats) {
    format.escapeSequenceUpperCase = rng.chance(0.5);
    const mtdRoll = rng.next();
    if (mtdRoll >= 0.5 && mtdRoll < 0.75) format.minimumTimeDecimals = 1;
    else if (mtdRoll >= 0.75 && mtdRoll < 0.9) format.minimumTimeDecimals = 2;
    else if (mtdRoll >= 0.9) format.minimumTimeDecimals = 3;
    // else no floor: the option is left unset
  }

  return format;
}

/**
 * Rewrites every fractional second in the document down to one or two digits.
 *
 * Variant 4 needs sources that wrote fewer digits than a replacement value
 * needs, because that is the state where a truncating edit changes the value.
 * The generator only emits six-digit fractions, which are wide enough to write
 * any millisecond exactly.
 */
export function shortenFractionalSeconds(source: string, rng: SeededRandom): string {
  return source.replace(
    /(\d{2}:\d{2}:\d{2})\.(\d{6})/g,
    (_match: string, time: string, digits: string) =>
      `${time}.${digits.slice(0, rng.nextRange(1, 2))}`
  );
}

export function describeFormat(fmt: Partial<TomlFormat> | undefined): string {
  if (!fmt) return 'default';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fmt)) {
    parts.push(`${k}=${JSON.stringify(v)}`);
  }
  return parts.join(', ') || 'empty';
}

// ─── Fuzz runner ─────────────────────────────────────────────────────────

export interface FuzzContext {
  seed: number;
  mutationCount: number;
  source: string;
  generated: GeneratedSource;
}

export interface GeneratedSource {
  source: string;
  description?: string;
  metadata?: unknown;
}

export interface MutationRun {
  updated: unknown;
  descriptions: string[];
  plans?: MutationPlan[];
}

export interface MutationPlan {
  kind: string;
  path: (string | number)[];
  newValue?: unknown;
}

export function snapshotMutationPlan<T extends MutationPlan>(plan: T): T {
  return deepClone(plan) as T;
}

export type SourceTransform = (source: string, context: FuzzContext) => string;
export type FormatGenerator = (context: FuzzContext) => Partial<TomlFormat> | undefined;
export type FuzzComparator = (
  expected: unknown,
  actual: unknown,
  format: Partial<TomlFormat> | undefined
) => boolean;
export type MutationStrategy = (input: {
  original: unknown;
  updated: unknown;
  context: FuzzContext;
}) => MutationRun;

export interface FuzzConfig {
  generateSource?: (context: Pick<FuzzContext, 'seed' | 'mutationCount'>) => GeneratedSource;
  sourceTransforms?: SourceTransform[];
  generateFormat?: FormatGenerator;
  mutate?: MutationStrategy;
  compare?: FuzzComparator;
  mutationCount?: number;
  variant?: string;
  profile?: string;
}

export interface PatchFuzzResult {
  seed: number;
  mutations: number;
  status: 'ok' | 'patch-fail' | 'roundtrip-mismatch' | 'error';
  error?: string;
  originalToml?: string;
  patchedToml?: string;
  modifiedObj?: unknown;
  reParsedObj?: unknown;
  variant?: string;
  profile?: string;
  generatorDescription?: string;
  mutationDescs?: string[];
  mutationPlans?: MutationPlan[];
  formatDesc?: string;
  format?: Partial<TomlFormat>;
}

/**
 * Recursively replaces CRLF with LF inside strings. A `newLine` format makes
 * patch() normalise every line ending in the document, including multiline
 * string content, so both sides are compared with one spelling.
 */
export function normalizeNewlines(value: unknown, fmt?: Partial<TomlFormat>): unknown {
  if (fmt?.newLine === undefined) return value;
  if (typeof value === 'string') return value.replace(/\r\n/g, '\n');
  if (Array.isArray(value)) return value.map((item) => normalizeNewlines(item, fmt));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      result[key] = normalizeNewlines((value as any)[key], fmt);
    }
    return result;
  }
  return value;
}

/**
 * Switches used by the numbered fuzz variants. Every field defaults to the
 * behaviour the earlier variants share, so enabling none of them keeps an
 * existing variant on exactly the same RNG sequence and corpus.
 */
export interface FuzzOptions {
  /** Replacement dates carry a time of day and a random millisecond. */
  subSecondDates?: boolean;
  /** Also randomize the format options the earlier variants never set. */
  fullFormats?: boolean;
  /** Rewrite source fractional seconds down to one or two digits. */
  shortenFractions?: boolean;
  /** Aim most mutations at date leaves, and always give them a date value. */
  dateFocus?: boolean;
}

export function generateDefaultSource({ seed }: Pick<FuzzContext, 'seed'>): GeneratedSource {
  const generated = randomToml({ seed });
  return {
    source: generated.toml,
    metadata: generated.document
  };
}

function defaultMutationStrategy({ updated, context }: {
  original: unknown;
  updated: unknown;
  context: FuzzContext;
}, subSecondDates = false, dateFocus = false): MutationRun {
  const mutationRng = new SeededRandom(context.seed + context.mutationCount * 1_000_000);
  const aotKeyPaths = new Set<string>();
  (function collectAotKeys(node: any) {
    if (!node || typeof node !== 'object') return;
    if (node.type === NodeType.TableArray && node.key && node.key.item) {
      aotKeyPaths.add((node.key.item.value as string[]).join('.'));
    }
    if (Array.isArray(node.items)) for (const item of node.items) collectAotKeys(item);
    if (node.value) collectAotKeys(node.value);
    if (node.item) collectAotKeys(node.item);
  })(context.generated.metadata);
  const isTableLike = (value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

  const mutationDescs: string[] = [];
  const mutationPlans: MutationPlan[] = [];
  let applied = 0;
  let attempts = 0;
  while (applied < context.mutationCount && attempts < context.mutationCount * 5) {
    attempts++;
    const mutation = generateMutation(updated, mutationRng, subSecondDates, dateFocus);
    if (!mutation) break;
    if (mutation.newValue !== undefined && !isTableLike(mutation.newValue)) {
      const lastSeg = mutation.path[mutation.path.length - 1];
      const parentPath = mutation.path.slice(0, -1);
      const stringPath = parentPath.filter(seg => typeof seg === 'string').join('.');
      if (typeof lastSeg === 'number' && aotKeyPaths.has(stringPath)) continue;
    }
    applyMutation(updated, mutation);
    mutationDescs.push(`${mutation.kind} at ${mutation.path.join('.') || 'root'}`);
    mutationPlans.push(snapshotMutationPlan(mutation));
    applied++;
  }

  return { updated, descriptions: mutationDescs, plans: mutationPlans };
}

export function createFormatGenerator(
  randomizeIndentWidth: boolean,
  randomizeMultiline: boolean,
  fullFormats: boolean
): FormatGenerator {
  return ({ seed }) => randomTomlFormat(
    new SeededRandom(seed + 500_000),
    randomizeIndentWidth,
    randomizeMultiline,
    fullFormats
  );
}

export function createDefaultMutationStrategy(options: Pick<FuzzOptions, 'subSecondDates' | 'dateFocus'> = {}): MutationStrategy {
  return (input) => defaultMutationStrategy(input, options.subSecondDates, options.dateFocus);
}

function defaultComparator(
  expected: unknown,
  actual: unknown,
  format: Partial<TomlFormat> | undefined
): boolean {
  return deepEqualWithFormat(expected, actual, format);
}

function runResultMetadata(result: PatchFuzzResult, config: FuzzConfig, generated: GeneratedSource): PatchFuzzResult {
  return {
    ...result,
    ...(config.variant ? { variant: config.variant } : {}),
    ...(config.profile ? { profile: config.profile } : {}),
    ...(generated.description ? { generatorDescription: generated.description } : {})
  };
}

export function runFuzz(seed: number, config: FuzzConfig = {}): PatchFuzzResult {
  const mutationCount = config.mutationCount ?? 3;
  const baseResult: PatchFuzzResult = {
    seed,
    mutations: mutationCount,
    status: 'ok',
    ...(config.variant ? { variant: config.variant } : {}),
    ...(config.profile ? { profile: config.profile } : {})
  };

  try {
    const generated = (config.generateSource ?? generateDefaultSource)({ seed, mutationCount });
    const context: FuzzContext = {
      seed,
      mutationCount,
      source: generated.source,
      generated
    };
    let source = generated.source;
    for (const transform of config.sourceTransforms ?? []) {
      source = transform(source, context);
      context.source = source;
    }

    let original: any;
    try {
      original = parse(source);
    } catch {
      return runResultMetadata(baseResult, config, generated);
    }

    const updated = deepClone(original) as any;
    const format = (config.generateFormat ?? createFormatGenerator(false, false, false))(context);
    const formatDesc = describeFormat(format);
    const mutationRun = (config.mutate ?? defaultMutationStrategy)({ original, updated, context });
    if (mutationRun.descriptions.length === 0) {
      return runResultMetadata({
        ...baseResult,
        formatDesc,
        originalToml: source,
        patchedToml: source
      }, config, generated);
    }

    const result = runResultMetadata({
      ...baseResult,
      mutationDescs: mutationRun.descriptions,
      ...(mutationRun.plans ? { mutationPlans: mutationRun.plans } : {}),
      formatDesc,
      ...(format ? { format } : {})
    }, config, generated);
    let patchedToml: string;
    try {
      patchedToml = patch(source, mutationRun.updated, format);
    } catch (error: any) {
      return {
        ...result,
        status: 'patch-fail',
        error: `patch() threw: ${error.message}`,
        originalToml: source,
        modifiedObj: mutationRun.updated
      };
    }

    let reParsed: any;
    try {
      reParsed = parse(patchedToml);
    } catch (error: any) {
      return {
        ...result,
        status: 'roundtrip-mismatch',
        error: `re-parse failed: ${error.message}`,
        originalToml: source,
        patchedToml,
        modifiedObj: mutationRun.updated
      };
    }

    const compare = config.compare ?? defaultComparator;
    if (!compare(mutationRun.updated, reParsed, format)) {
      return {
        ...result,
        status: 'roundtrip-mismatch',
        error: 'Objects differ after patch round-trip',
        originalToml: source,
        patchedToml,
        modifiedObj: mutationRun.updated,
        reParsedObj: reParsed
      };
    }

    return {
      ...result,
      originalToml: source,
      patchedToml
    };
  } catch (error: any) {
    return {
      ...baseResult,
      status: 'error',
      error: `Unexpected: ${error.message}\n${error.stack}`
    };
  }
}

export function fuzzOne(
  seed: number,
  mutationCount: number,
  sourceTransform?: (source: string) => string,
  randomizeIndentWidth = false,
  randomizeMultiline = false,
  options: FuzzOptions = {}
): PatchFuzzResult {
  const sourceTransforms: SourceTransform[] = [];
  if (sourceTransform) sourceTransforms.push((source) => sourceTransform(source));
  if (options.shortenFractions) {
    sourceTransforms.push((source, context) =>
      shortenFractionalSeconds(source, new SeededRandom(context.seed + 700_000))
    );
  }

  return runFuzz(seed, {
    mutationCount,
    sourceTransforms,
    generateFormat: createFormatGenerator(randomizeIndentWidth, randomizeMultiline, options.fullFormats ?? false),
    mutate: createDefaultMutationStrategy(options),
    compare: options.subSecondDates
      ? (expected, actual, format) => deepEqual(normalizeNewlines(expected, format), normalizeNewlines(actual, format))
      : defaultComparator
  });
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
      if (result.formatDesc) {
        console.log(`Format: ${result.formatDesc}`);
      }
      if (result.mutationDescs) {
        console.log('Mutations:');
        result.mutationDescs.forEach(d => console.log(`  ${d}`));
      }
      if (result.modifiedObj) {
        console.log('--- Modified object (JSON) ---');
        console.log(JSON.stringify(result.modifiedObj, (k, v) =>
          typeof v === 'bigint' ? Number(v) : v, 2));
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

// Only run the CLI fuzz loop when executed directly, so local scripts can
// import the helpers (fuzzOne, generateMutation, …) without side effects.
if (import.meta.main) {
  main();
}
