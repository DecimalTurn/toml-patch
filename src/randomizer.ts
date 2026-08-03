/**
 * @file Deterministic TOML file randomizer for fuzz testing.
 *
 * Generates valid TOML documents by randomly constructing CST nodes
 * while respecting TOML grammar rules. Uses a seeded PRNG so the
 * same seed always produces the same output.
 *
 * @module randomizer
 */

import {
  NodeType,
  Document,
  Table,
  TableArray,
  KeyValue,
  Key,
  Value,
  String as StringNode,
  Integer,
  Float,
  Boolean as BooleanNode,
  DateTime,
  InlineArray,
  InlineArrayItem,
  InlineTable,
  InlineTableItem,
  Comment,
  TreeNode,
  Block,
  RowItem
} from './cst';
import { clonePosition, Position, Location } from './location';
import { generateKey } from './generate';

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────────

/**
 * A deterministic 32-bit PRNG based on mulberry32.
 * Given the same seed, always produces the same sequence of values.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [0, max) (exclusive max). */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Returns an integer in [min, max] (inclusive). */
  nextRange(min: number, max: number): number {
    return min + this.nextInt(max - min + 1);
  }

  /** Pick a random element from an array or a random character from a string. */
  pick<T>(arr: readonly T[] | string): T {
    if (typeof arr === 'string') {
      return arr[this.nextInt(arr.length)] as unknown as T;
    }
    return arr[this.nextInt(arr.length)];
  }

  /** Pick a weighted random element. Weights are unnormalized. */
  pickWeighted<T>(items: readonly { item: T; weight: number }[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let r = this.next() * total;
    for (const entry of items) {
      r -= entry.weight;
      if (r <= 0) return entry.item;
    }
    return items[items.length - 1].item;
  }

  /**
   * Returns true with the given probability (0 to 1).
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

// ─── Options ─────────────────────────────────────────────────────────────

export interface RandomizerOptions {
  /** PRNG seed. Default: random (Date.now()). */
  seed?: number;
  /** Maximum inline nesting depth (inline tables/arrays inside inline tables). Default: 3. */
  maxDepth?: number;
  /** Maximum number of tables + table arrays. Default: 10. */
  maxTables?: number;
  /** Maximum key-value pairs per table/section. Default: 15. */
  maxKeyValues?: number;
  /** Maximum inline array items. Default: 10. */
  maxArrayLength?: number;
  /** Maximum string length in characters. Default: 50. */
  maxStringLength?: number;
  /** Maximum key part length. Default: 10. */
  maxKeyLength?: number;
  /** Maximum dotted key parts. Default: 3. */
  maxDottedKeys?: number;
}

const DEFAULTS: Required<Omit<RandomizerOptions, 'seed'>> = {
  maxDepth: 3,
  maxTables: 10,
  maxKeyValues: 15,
  maxArrayLength: 10,
  maxStringLength: 50,
  maxKeyLength: 10,
  maxDottedKeys: 3
};

function resolveOptions(options?: RandomizerOptions): Required<RandomizerOptions> {
  const seed = options?.seed ?? Date.now();
  return { seed, ...DEFAULTS, ...options };
}

// ─── Random text generators ──────────────────────────────────────────────

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const ALPHA_NUM = ALPHA + '0123456789';
const BARE_KEY_CHARS = ALPHA_NUM + '_-';
const PRINTABLE_CHARS =
  ' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' +
  '!@#$%^&*()-_=+[]{}|;:,.<>?/`~';

function randomBareKey(rng: SeededRandom, maxLen: number): string {
  const len = rng.nextRange(1, Math.min(maxLen, 20));
  let key: string = rng.pick(ALPHA) as string; // must start with alpha
  for (let i = 1; i < len; i++) {
    key += rng.pick(BARE_KEY_CHARS) as string;
  }
  return key;
}

function randomBasicStringValue(rng: SeededRandom, maxLen: number): string {
  const len = rng.nextRange(0, maxLen);
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = rng.pick(PRINTABLE_CHARS);
    // Avoid unescaped double-quote and backslash in basic strings
    if (c === '"' || c === '\\') {
      s += '\\' + c;
    } else {
      s += c;
    }
  }
  return s;
}

function randomLiteralStringValue(rng: SeededRandom, maxLen: number): string {
  const len = rng.nextRange(0, maxLen);
  let s = '';
  for (let i = 0; i < len; i++) {
    let c = rng.pick(PRINTABLE_CHARS);
    // Literal strings cannot contain single quotes
    if (c === "'") c = rng.pick('abcdefghijklmnopqrstuvwxyz');
    s += c;
  }
  return s;
}

function randomMultilineStringValue(rng: SeededRandom, maxLen: number): string {
  const len = rng.nextRange(0, maxLen);
  let s = rng.chance(0.5) ? '\n' : '';
  for (let i = 0; i < len; i++) {
    if (rng.chance(0.1)) {
      s += '\n';
    } else {
      const c = rng.pick(PRINTABLE_CHARS);
      if (c === '\\') {
        s += '\\\\'; // escape backslashes
      } else {
        s += c;
      }
    }
  }
  return s;
}

function randomCommentText(rng: SeededRandom): string {
  const len = rng.nextRange(1, 40);
  let s = '';
  for (let i = 0; i < len; i++) {
    // Avoid newlines and control characters in comments
    const safe = ' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@$%^&*()-_=+[]{}|;:,.<>?/`~';
    s += rng.pick(safe);
  }
  return s.trim();
}

// ─── CST Node Generators ─────────────────────────────────────────────────

/**
 * Generates a random string CST node.
 */
function randomString(rng: SeededRandom, opts: Required<RandomizerOptions>): StringNode {
  const format = rng.pickWeighted([
    { item: 'basic' as const, weight: 50 },
    { item: 'literal' as const, weight: 25 },
    { item: 'ml-basic' as const, weight: 15 },
    { item: 'ml-literal' as const, weight: 10 }
  ]);

  let value: string;
  let raw: string;

  switch (format) {
    case 'basic': {
      value = randomBasicStringValue(rng, opts.maxStringLength);
      // JSON.stringify handles basic escaping, then fix U+007F
      raw = JSON.stringify(value).replace(/\x7f/g, '\\u007f');
      break;
    }
    case 'literal': {
      value = randomLiteralStringValue(rng, opts.maxStringLength);
      raw = `'${value}'`;
      break;
    }
    case 'ml-basic': {
      value = randomMultilineStringValue(rng, opts.maxStringLength);
      const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
      const lead = value.startsWith('\n') ? '' : '\n';
      raw = `"""${lead}${escaped}"""`;
      break;
    }
    case 'ml-literal': {
      value = randomMultilineStringValue(rng, opts.maxStringLength);
      // Ensure no triple single-quote in value
      value = value.replace(/'''/g, "''");
      const lead = value.startsWith('\n') ? '' : '\n';
      raw = `'''${lead}${value}'''`;
      break;
    }
  }

  return { type: NodeType.String, loc: zeroLoc(), raw, value };
}

/**
 * Generates a random integer CST node.
 */
function randomInteger(rng: SeededRandom, _: Required<RandomizerOptions>): Integer {
  const format = rng.pickWeighted([
    { item: 'decimal' as const, weight: 70 },
    { item: 'hex' as const, weight: 10 },
    { item: 'octal' as const, weight: 10 },
    { item: 'binary' as const, weight: 10 }
  ]);

  let raw: string;
  let value: number | bigint;

  switch (format) {
    case 'decimal': {
      const useUnderscore = rng.chance(0.2);
      if (rng.chance(0.1)) {
        // Large integer — use bigint
        const bigVal = BigInt(rng.nextRange(0, 999999)) * 100000000000000n + BigInt(rng.nextRange(0, 999999));
        const isNegative = rng.chance(0.3);
        const digits = bigVal.toString();
        value = isNegative ? -bigVal : bigVal;
        raw = (isNegative ? '-' : '') + (useUnderscore && digits.length > 3 ? addUnderscores(digits) : digits);
      } else {
        const num = rng.nextRange(0, 999999);
        const isNegative = rng.chance(0.3);
        const digits = num.toString();
        value = isNegative ? -num : num;
        raw = (isNegative ? '-' : '') + (useUnderscore && digits.length > 3 ? addUnderscores(digits) : digits);
      }
      break;
    }
    case 'hex': {
      const hexDigits = '0123456789abcdef';
      const len = rng.nextRange(1, 8);
      let hex = '';
      for (let i = 0; i < len; i++) hex += rng.pick(hexDigits);
      raw = '0x' + hex;
      value = BigInt(raw);
      break;
    }
    case 'octal': {
      const len = rng.nextRange(1, 8);
      let oct = '';
      for (let i = 0; i < len; i++) oct += rng.pick('01234567');
      raw = '0o' + oct;
      value = BigInt(raw);
      break;
    }
    case 'binary': {
      const len = rng.nextRange(1, 16);
      let bin = '';
      for (let i = 0; i < len; i++) bin += rng.pick('01');
      raw = '0b' + bin;
      value = BigInt(raw);
      break;
    }
  }

  return { type: NodeType.Integer, loc: zeroLoc(), raw, value };
}

function addUnderscores(digits: string): string {
  let result = '';
  for (let i = digits.length - 1, count = 0; i >= 0; i--, count++) {
    if (count > 0 && count % 3 === 0) result = '_' + result;
    result = digits[i] + result;
  }
  return result;
}

/**
 * Generates a random float CST node.
 */
function randomFloat(rng: SeededRandom, _: Required<RandomizerOptions>): Float {
  const kind = rng.pickWeighted([
    { item: 'regular' as const, weight: 70 },
    { item: 'inf' as const, weight: 10 },
    { item: 'nan' as const, weight: 10 },
    { item: 'exp' as const, weight: 10 }
  ]);

  let raw: string;
  let value: number;

  switch (kind) {
    case 'regular': {
      const sign = rng.chance(0.3) ? '-' : '';
      const intPart = rng.nextRange(0, 99999);
      const fracPart = rng.nextRange(0, 99999);
      const useUnderscore = rng.chance(0.1);
      let intStr = intPart.toString();
      let fracStr = fracPart.toString().padStart(rng.nextRange(0, 6), '0');
      if (useUnderscore && intStr.length > 3) intStr = addUnderscores(intStr);
      raw = `${sign}${intStr}.${fracStr}`;
      value = parseFloat(raw);
      break;
    }
    case 'inf': {
      const sign = rng.chance(0.5) ? '-' : '';
      raw = sign + 'inf';
      value = sign === '-' ? -Infinity : Infinity;
      break;
    }
    case 'nan': {
      raw = 'nan';
      value = NaN;
      break;
    }
    case 'exp': {
      const sign = rng.chance(0.3) ? '-' : '';
      const mantissa = rng.nextRange(1, 999);
      const expSign = rng.chance(0.5) ? '+' : '-';
      const exp = rng.nextRange(0, 99);
      raw = `${sign}${mantissa}e${expSign}${exp}`;
      value = parseFloat(raw);
      break;
    }
  }

  return { type: NodeType.Float, loc: zeroLoc(), raw, value };
}

/**
 * Generates a random boolean CST node.
 */
function randomBoolean(rng: SeededRandom): BooleanNode {
  const value = rng.chance(0.5);
  // Boolean nodes don't have a raw field — the serializer uses value
  return { type: NodeType.Boolean, loc: zeroLoc(), value };
}

/**
 * Generates a random DateTime CST node.
 */
function randomDateTime(rng: SeededRandom): DateTime {
  const kind = rng.pickWeighted([
    { item: 'offset-date-time' as const, weight: 40 },
    { item: 'local-date-time' as const, weight: 25 },
    { item: 'local-date' as const, weight: 20 },
    { item: 'local-time' as const, weight: 15 }
  ]);

  let raw: string;
  let value: Date;

  const year = rng.nextRange(1970, 2099);
  const month = String(rng.nextRange(1, 12)).padStart(2, '0');
  const day = String(rng.nextRange(1, 28)).padStart(2, '0');
  const hour = String(rng.nextRange(0, 23)).padStart(2, '0');
  const min = String(rng.nextRange(0, 59)).padStart(2, '0');
  const sec = String(rng.nextRange(0, 59)).padStart(2, '0');
  const ms = rng.chance(0.3) ? '.' + String(rng.nextRange(0, 999999)).padStart(6, '0') : '';

  switch (kind) {
    case 'offset-date-time':
      raw = `${year}-${month}-${day}T${hour}:${min}:${sec}${ms}Z`;
      value = new Date(raw);
      break;
    case 'local-date-time':
      raw = `${year}-${month}-${day}T${hour}:${min}:${sec}${ms}`;
      value = new Date(raw);
      break;
    case 'local-date':
      raw = `${year}-${month}-${day}`;
      value = new Date(raw + 'T00:00:00');
      break;
    case 'local-time':
      raw = `${hour}:${min}:${sec}${ms}`;
      value = new Date(`1970-01-01T${raw}`);
      break;
  }

  return { type: NodeType.DateTime, loc: zeroLoc(), raw, value };
}

/**
 * Generates a random Key (array of key parts).
 */
function randomKey(rng: SeededRandom, opts: Required<RandomizerOptions>): string[] {
  const numParts = rng.nextRange(1, opts.maxDottedKeys);
  const parts: string[] = [];
  for (let i = 0; i < numParts; i++) {
    if (rng.chance(0.7)) {
      parts.push(randomBareKey(rng, opts.maxKeyLength));
    } else {
      // Quoted key
      parts.push(randomBasicStringValue(rng, opts.maxKeyLength));
    }
  }
  return parts;
}

/**
 * Generates a random Comment CST node.
 */
function randomComment(rng: SeededRandom): Comment {
  const text = randomCommentText(rng);
  return {
    type: NodeType.Comment,
    loc: zeroLoc(),
    raw: '# ' + text
  };
}

/**
 * Generates a random Value CST node, respecting depth limits for inline nesting.
 */
function randomValue(rng: SeededRandom, opts: Required<RandomizerOptions>, depth: number): Value {
  const choices: { item: string; weight: number }[] = [
    { item: 'string', weight: 30 },
    { item: 'integer', weight: 25 },
    { item: 'float', weight: 15 },
    { item: 'boolean', weight: 15 },
    { item: 'datetime', weight: 10 }
  ];

  // Only allow inline nesting if within depth limits
  if (depth < opts.maxDepth) {
    choices.push({ item: 'array', weight: 3 });
    choices.push({ item: 'inline-table', weight: 2 });
  }

  const kind = rng.pickWeighted(choices);

  switch (kind) {
    case 'string': return randomString(rng, opts);
    case 'integer': return randomInteger(rng, opts);
    case 'float': return randomFloat(rng, opts);
    case 'boolean': return randomBoolean(rng);
    case 'datetime': return randomDateTime(rng);
    case 'array': return randomInlineArray(rng, opts, depth + 1);
    case 'inline-table': return randomInlineTable(rng, opts, depth + 1);
    default: return randomString(rng, opts);
  }
}

/**
 * Generates a random InlineArray CST node.
 */
function randomInlineArray(rng: SeededRandom, opts: Required<RandomizerOptions>, depth: number): InlineArray {
  const len = rng.nextRange(0, opts.maxArrayLength);
  const items: InlineArrayItem[] = [];

  for (let i = 0; i < len; i++) {
    const value = randomValue(rng, opts, depth);
    const comma = i < len - 1;
    items.push({
      type: NodeType.InlineItem,
      loc: zeroLoc(),
      item: value,
      comma
    });
  }

  return {
    type: NodeType.InlineArray,
    loc: { start: zeroPos(), end: zeroPos() },
    items
  };
}

/**
 * Generates a random InlineTable CST node.
 */
function randomInlineTable(rng: SeededRandom, opts: Required<RandomizerOptions>, depth: number): InlineTable {
  const len = rng.nextRange(0, opts.maxKeyValues);
  const items: InlineTableItem[] = [];

  for (let i = 0; i < len; i++) {
    const kv = randomKeyValue(rng, opts, depth);
    const comma = i < len - 1;
    items.push({
      type: NodeType.InlineItem,
      loc: zeroLoc(),
      item: kv,
      comma
    });
  }

  return {
    type: NodeType.InlineTable,
    loc: { start: zeroPos(), end: zeroPos() },
    items
  };
}

/**
 * Generates a random KeyValue CST node.
 */
function randomKeyValue(rng: SeededRandom, opts: Required<RandomizerOptions>, depth: number): KeyValue {
  const key = randomKey(rng, opts);
  const value = randomValue(rng, opts, depth);
  const keyNode = generateKey(key);

  return {
    type: NodeType.KeyValue,
    loc: { start: clonePosition(keyNode.loc.start), end: clonePosition(keyNode.loc.end) },
    key: keyNode,
    value,
    equals: keyNode.loc.end.column + 1
  };
}

/**
 * Generates random RowItem nodes (KeyValue or Comment).
 */
function randomRowItems(rng: SeededRandom, opts: Required<RandomizerOptions>, depth: number): RowItem[] {
  const count = rng.nextRange(0, opts.maxKeyValues);
  const items: RowItem[] = [];

  for (let i = 0; i < count; i++) {
    if (rng.chance(0.15)) {
      items.push(randomComment(rng));
    } else {
      items.push(randomKeyValue(rng, opts, depth));
    }
  }

  return items;
}

/**
 * Generates a random Table CST node.
 */
function randomTable(rng: SeededRandom, opts: Required<RandomizerOptions>): Table {
  const key = randomKey(rng, opts);
  const keyRaw = keyToRaw(key);
  const keyNode: Key = {
    type: NodeType.Key,
    loc: zeroLoc(),
    raw: keyRaw,
    value: key
  };

  return {
    type: NodeType.Table,
    loc: zeroLoc(),
    key: {
      type: NodeType.TableKey,
      loc: zeroLoc(),
      item: keyNode
    },
    items: randomRowItems(rng, opts, 0)
  };
}

/**
 * Generates a random TableArray CST node.
 */
function randomTableArray(rng: SeededRandom, opts: Required<RandomizerOptions>): TableArray {
  const key = randomKey(rng, opts);
  const keyRaw = keyToRaw(key);
  const keyNode: Key = {
    type: NodeType.Key,
    loc: zeroLoc(),
    raw: keyRaw,
    value: key
  };

  return {
    type: NodeType.TableArray,
    loc: zeroLoc(),
    key: {
      type: NodeType.TableArrayKey,
      loc: zeroLoc(),
      item: keyNode
    },
    items: randomRowItems(rng, opts, 0)
  };
}

/**
 * Converts a key array to a raw TOML key string.
 */
function keyToRaw(key: string[]): string {
  return key.map(part => {
    if (/^[a-zA-Z0-9_-]+$/.test(part)) return part;
    return JSON.stringify(part);
  }).join('.');
}

// ─── Location Helpers ────────────────────────────────────────────────────

function zeroPos(): Position {
  return { line: 1, column: 0 };
}

function zeroLoc(): Location {
  return { start: zeroPos(), end: zeroPos() };
}

// ─── Serializer ──────────────────────────────────────────────────────────

/**
 * Serializes a CST Document to a TOML string.
 * This is a custom serializer for randomly generated CSTs that
 * doesn't require precise location information.
 */
export function serializeDocument(doc: Document): string {
  const lines: string[] = [];
  serializeBlocks(doc.items, lines);
  return lines.join('\n') + '\n';
}

function serializeBlocks(blocks: Block[], lines: string[], indent = ''): void {
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0 && !isCommentNode(blocks[i - 1])) {
      // Add blank line before tables/table arrays (but not between comments and their targets)
      if (blocks[i].type === NodeType.Table || blocks[i].type === NodeType.TableArray) {
        lines.push('');
      }
    }
    serializeBlock(blocks[i], lines, indent);
  }
}

function isCommentNode(node: TreeNode): boolean {
  return node.type === NodeType.Comment;
}

function serializeBlock(block: Block, lines: string[], indent: string): void {
  switch (block.type) {
    case NodeType.KeyValue:
      serializeKeyValue(block as KeyValue, lines, indent);
      break;
    case NodeType.Comment:
      lines.push(indent + (block as Comment).raw);
      break;
    case NodeType.Table:
      serializeTable(block as Table, lines, indent);
      break;
    case NodeType.TableArray:
      serializeTableArray(block as TableArray, lines, indent);
      break;
  }
}

function serializeTable(table: Table, lines: string[], _: string): void {
  const keyRaw = table.key.item.raw;
  lines.push(`[${keyRaw}]`);
  for (const item of table.items) {
    serializeRowItem(item, lines);
  }
}

function serializeTableArray(tableArray: TableArray, lines: string[], _: string): void {
  const keyRaw = tableArray.key.item.raw;
  lines.push(`[[${keyRaw}]]`);
  for (const item of tableArray.items) {
    serializeRowItem(item, lines);
  }
}

function serializeRowItem(item: RowItem, lines: string[]): void {
  if (item.type === NodeType.KeyValue) {
    serializeKeyValue(item as KeyValue, lines, '');
  } else {
    lines.push((item as Comment).raw);
  }
}

function serializeKeyValue(kv: KeyValue, lines: string[], indent: string): void {
  const keyStr = kv.key.raw;
  const valueStr = serializeValue(kv.value);
  lines.push(`${indent}${keyStr} = ${valueStr}`);
}

function serializeValue(value: Value): string {
  switch (value.type) {
    case NodeType.String:
      return (value as StringNode).raw;
    case NodeType.Integer:
      return (value as Integer).raw;
    case NodeType.Float:
      return (value as Float).raw;
    case NodeType.Boolean:
      return (value as BooleanNode).value ? 'true' : 'false';
    case NodeType.DateTime:
      return (value as DateTime).raw;
    case NodeType.InlineArray:
      return serializeInlineArray(value as InlineArray);
    case NodeType.InlineTable:
      return serializeInlineTable(value as InlineTable);
    default:
      return '';
  }
}

function serializeInlineArray(arr: InlineArray): string {
  const parts = arr.items.map(item => {
    const val = serializeValue(item.item as Value);
    return item.comma ? val + ',' : val;
  });
  return '[' + parts.join(' ') + ']';
}

function serializeInlineTable(table: InlineTable): string {
  if (table.items.length === 0) return '{}';
  const parts = table.items.map(item => {
    const kv = item.item as KeyValue;
    const keyStr = kv.key.raw;
    const valueStr = serializeValue(kv.value);
    return item.comma ? `${keyStr} = ${valueStr},` : `${keyStr} = ${valueStr}`;
  });
  return '{ ' + parts.join(' ') + ' }';
}

// ─── Main Entry Point ────────────────────────────────────────────────────

export interface RandomTomlResult {
  /** The TOML document as a string. */
  toml: string;
  /** The CST Document node. */
  document: Document;
  /** The seed used for generation (useful for reproducing). */
  seed: number;
}

/**
 * Generates a random TOML document.
 *
 * @param options - Configuration options for the randomizer.
 * @returns A RandomTomlResult containing the TOML string, CST document, and seed.
 *
 * @example
 * ```typescript
 * import { randomToml } from './randomizer';
 *
 * // Generate with a fixed seed for reproducibility
 * const result = randomToml({ seed: 42 });
 * console.log(result.toml);
 *
 * // Generate with a random seed
 * const result2 = randomToml();
 * console.log(`Seed: ${result2.seed}`);
 * ```
 */
export function randomToml(options?: RandomizerOptions): RandomTomlResult {
  const opts = resolveOptions(options);
  const rng = new SeededRandom(opts.seed);

  const document = randomDocument(rng, opts);
  const toml = serializeDocument(document);

  return { toml, document, seed: opts.seed };
}

function randomDocument(rng: SeededRandom, opts: Required<RandomizerOptions>): Document {
  const items: Block[] = [];

  // Decide how many top-level KVPs (before any table)
  const topLevelKvpCount = rng.nextRange(0, opts.maxKeyValues);
  for (let i = 0; i < topLevelKvpCount; i++) {
    if (rng.chance(0.1)) {
      items.push(randomComment(rng));
    } else {
      items.push(randomKeyValue(rng, opts, 0));
    }
  }

  // Add tables and table arrays
  const tableCount = rng.nextRange(0, opts.maxTables);
  for (let i = 0; i < tableCount; i++) {
    // Add optional blank-line comment before table
    if (rng.chance(0.15)) {
      items.push(randomComment(rng));
    }

    if (rng.chance(0.3)) {
      items.push(randomTableArray(rng, opts));
    } else {
      items.push(randomTable(rng, opts));
    }
  }

  // Add trailing comments
  if (rng.chance(0.2) && items.length > 0) {
    items.push(randomComment(rng));
  }

  return {
    type: NodeType.Document,
    loc: zeroLoc(),
    items
  };
}

