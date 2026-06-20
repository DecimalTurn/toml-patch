/**
 * @file Helpers to generate and update TOML CST nodes.
 * @module generate
 */

import {
  NodeType,
  Document,
  Table,
  TableKey,
  TableArray,
  TableArrayKey,
  Value,
  KeyValue,
  Key,
  String,
  Integer,
  Float,
  Boolean,
  DateTime,
  InlineArray,
  InlineItem,
  InlineTable,
  Comment
} from './cst';
import { zero, cloneLocation, clonePosition, Position } from './location';
import { LocalDate } from './parse-toml';
import { shiftNode } from './writer';
import { rebuildLineContinuation } from './line-ending-backslash';
import { IS_BARE_KEY } from './tokenizer';
import { escapeStringContent } from './escape-preference';
import {isBasicString, isMultilineBasicString, isLiteralString, isMultilineLiteralString, temporalToTomlString} from './utils';

/**
 * Generates a new TOML document node.
 *
 * @returns A new Document node.
 */
export function generateDocument(): Document {
  return {
    type: NodeType.Document,
    loc: { start: zero(), end: zero() },
    items: []
  };
}

export function generateTable(key: string[]): Table {
  const table_key = generateTableKey(key);

  return {
    type: NodeType.Table,
    loc: cloneLocation(table_key.loc),
    key: table_key,
    items: []
  };
}

export function generateTableKey(key: string[]): TableKey {
  const raw = keyValueToRaw(key);

  return {
    type: NodeType.TableKey,
    loc: {
      start: zero(),
      end: { line: 1, column: raw.length + 2 }
    },
    item: {
      type: NodeType.Key,
      loc: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: raw.length + 1 }
      },
      value: key,
      raw
    }
  };
}

export function generateTableArray(key: string[]): TableArray {
  const table_array_key = generateTableArrayKey(key);

  return {
    type: NodeType.TableArray,
    loc: cloneLocation(table_array_key.loc),
    key: table_array_key,
    items: []
  };
}

export function generateTableArrayKey(key: string[]): TableArrayKey {
  const raw = keyValueToRaw(key);

  return {
    type: NodeType.TableArrayKey,
    loc: {
      start: zero(),
      end: { line: 1, column: raw.length + 4 }
    },
    item: {
      type: NodeType.Key,
      loc: {
        start: { line: 1, column: 2 },
        end: { line: 1, column: raw.length + 2 }
      },
      value: key,
      raw
    }
  };
}

export function generateKeyValue(key: string[], value: Value): KeyValue {
  const key_node = generateKey(key);
  const { column } = key_node.loc.end;

  const equals = column + 1;

  shiftNode(
    value,
    { lines: 0, columns: column + 3 - value.loc.start.column },
    { first_line_only: true }
  );

  return {
    type: NodeType.KeyValue,
    loc: {
      start: clonePosition(key_node.loc.start),
      end: clonePosition(value.loc.end)
    },
    key: key_node,
    equals,
    value
  };
}

function quoteTomlString(value: string): string {
  // JSON.stringify leaves U+007F as a raw character, but TOML requires it escaped.
  return JSON.stringify(value).replace(/\x7f/g, '\\u007f');
}

function keyValueToRaw(value: string[]): string {
  return value.map(part => (IS_BARE_KEY.test(part) ? part : quoteTomlString(part))).join('.');
}

export function generateKey(value: string[]): Key {
  const raw = keyValueToRaw(value);

  return {
    type: NodeType.Key,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
}

/**
 * Generates a new String node, preserving multiline format if existingRaw is provided.
 *
 * @param value - The string value.
 * @param existingRaw - The existing raw string to determine multiline format (optional).
 * @returns A new String node.
 */
export function generateString(value: string, existingRaw?: string): String {
  if (!existingRaw) {
    return generateBasicString(value);
  }
  return generateStringKeepFormatting(value, existingRaw);
}

function generateStringKeepFormatting(value: string, existingRaw: string): String {
  if (isBasicString(existingRaw)) {
    return generateBasicString(value, existingRaw);
  }

  if (isLiteralString(existingRaw)) {
    if (!value.includes("'")) {
      return generateLiteralString(value);
    }
    // Value contains a single quote — single-line literal strings cannot contain '.
    // Fall back to MLLS ('''value''') unless the value also contains ''', in which
    // case we must use a basic string.
    if (!value.includes("'''")) {
      const existingValue = existingRaw.slice(1, -1);
      const multilineRaw = `'''${existingValue}'''`;
      return generateMultilineLiteralString(value, multilineRaw);
    }
    return generateBasicString(value);
  }

  if (isMultilineLiteralString(existingRaw)) {
    // Literal strings cannot contain ''' - fallback to basic multi-line string if needed
    if (!value.includes("'''")) {
      return generateMultilineLiteralString(value, existingRaw);
    }
    const existingValue = existingRaw.slice(3, -3);
    const multilineRaw = `"""${existingValue}"""`;
    return generateMultilineBasicString(value, multilineRaw);
  }

  if (isMultilineBasicString(existingRaw)) {
    return generateMultilineBasicString(value, existingRaw);
  }

  // existingRaw is misformatted. This should be impossible
  throw new Error(`Existing raw string value is not valid: ${existingRaw}`);
}

function generateBasicString(value: string, existingRaw?: string): String {
  let raw = '';
  if (!existingRaw) {
    raw = quoteTomlString(value);
  } else {
    raw = `"${escapeStringContent(value, existingRaw, 'singleline-basic')}"`;
  }
   
  return {
    type: NodeType.String,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
}

function generateLiteralString(value: string): String {
  const raw = `'${value}'`;

  let endLocation;
  if (raw.includes('\n')) {
    const lines = raw.split(/\r\n|\n/);
    const lastLine = lines[lines.length - 1];
    endLocation = {
      line: lines.length,
      column: lastLine.length
    };
  } else {
    endLocation = { line: 1, column: raw.length };
  }

  return {
    type: NodeType.String,
    loc: { start: zero(), end: endLocation },
    raw,
    value
  };
}

function generateMultilineBasicString(value: string, existingRaw: string): String {
  const escaped = escapeStringContent(value, existingRaw, 'multiline-basic');

  const leadingNewLine = existingRaw.startsWith('"""\r\n')
    ? '\r\n'
    : existingRaw.startsWith('"""\n')
    ? '\n'
    : '';

  let raw = '"""' + leadingNewLine + escaped + '"""';

  const existingValue = existingRaw.slice(3, -3);
  // Line continuation is indicated by an odd number of backslashes at the end of any line.
  // Match: (start-of-line or a non-backslash), then zero or more escaped-backslash pairs,
  // then a single trailing backslash at end-of-line.
  if (/(^|[^\\])(\\\\)*\\$/m.test(existingValue)) {
    const rebuilt = rebuildLineContinuation(existingRaw, escaped);
    if (rebuilt !== null) {
      raw = rebuilt;
    }
  }

  const endLocation = endlocation(raw);

  return {
    type: NodeType.String,
    loc: { start: zero(), end: endLocation },
    raw,
    value
  };
}

function generateMultilineLiteralString(value: string, existingRaw: string): String {

  const leadingNewLine = existingRaw.startsWith("'''\r\n")
    ? '\r\n'
    : existingRaw.startsWith("'''\n")
    ? '\n'
    : '';

  const raw = "'''" + leadingNewLine + value + "'''";
  const endLocation = endlocation(raw);
  return {
    type: NodeType.String,
    loc: { start: zero(), end: endLocation },
    raw,
    value
  };
}

function endlocation (raw: string): Position {
  if (raw.includes('\n')) {
    const lines = raw.split(/\r\n|\n/);
    const lastLine = lines[lines.length - 1];
    return {
      line: lines.length,
      column: lastLine.length
    };
  } else {
    return { line: 1, column: raw.length };
  }
}


/**
 * Generates a new Integer node.
 *
 * @param value - The integer value.
 * @returns A new Integer node.
 */
export function generateInteger(value: number | bigint): Integer {
  const raw = value.toString();
  return {
    type: NodeType.Integer,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
}

export function generateFloat(value: number, minimumDecimals: number = 1): Float {
  let raw: string;
  
  if (value === Infinity) {
    raw = 'inf';
  } else if (value === -Infinity) {
    raw = '-inf';
  } else if (Number.isNaN(value)) {
    raw = 'nan';
  } else if (Object.is(value, -0)) {
    raw = '-0.' + '0'.repeat(Math.max(minimumDecimals, 1));
  } else {
    raw = value.toString();
    const exponentIndex = raw.search(/[eE]/);

    if (exponentIndex !== -1) {
      const mantissa = raw.slice(0, exponentIndex);
      const exponent = raw.slice(exponentIndex);
      const dotIndex = mantissa.indexOf('.');

      if (dotIndex === -1) {
        raw = `${mantissa}.${'0'.repeat(Math.max(minimumDecimals, 1))}${exponent}`;
      } else {
        const currentDecimals = mantissa.length - dotIndex - 1;
        raw = currentDecimals < minimumDecimals
          ? `${mantissa}${'0'.repeat(minimumDecimals - currentDecimals)}${exponent}`
          : `${mantissa}${exponent}`;
      }
    } else {
      const dotIndex = raw.indexOf('.');
      if (dotIndex === -1) {
        raw += '.' + '0'.repeat(Math.max(minimumDecimals, 1));
      } else {
        const currentDecimals = raw.length - dotIndex - 1;
        if (currentDecimals < minimumDecimals) {
          raw += '0'.repeat(minimumDecimals - currentDecimals);
        }
      }
    }
  }

  return {
    type: NodeType.Float,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
}

export function generateBoolean(value: boolean): Boolean {
  return {
    type: NodeType.Boolean,
    loc: { start: zero(), end: { line: 1, column: value ? 4 : 5 } },
    value
  };
}

export function generateDateTime(value: Date, truncateZeroTimeInDates: boolean = false): DateTime {
  
    // Convert Date objects with zero time components to LocalDate
    // so they are serialized as date-only in TOML
    if (truncateZeroTimeInDates &&
        value.getUTCHours() === 0 &&
        value.getUTCMinutes() === 0 &&
        value.getUTCSeconds() === 0 &&
        value.getUTCMilliseconds() === 0) {
      value = new LocalDate(value.toISOString().split('T')[0]);
    }
  
  // Custom date classes have their own toISOString() implementations
  // that return the properly formatted strings for each TOML date/time type
  const raw = value.toISOString();

  return {
    type: NodeType.DateTime,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
}

/**
 * Generates a DateTime CST node from a Temporal API object.
 *
 * Each Temporal type serializes to the corresponding TOML date/time format:
 * - Temporal.PlainDate      → "2024-01-15"
 * - Temporal.PlainTime      → "10:30:00.123"
 * - Temporal.PlainDateTime  → "2024-01-15T10:30:00.123"
 * - Temporal.ZonedDateTime  → "2024-01-15T10:30:00.123+05:30" (no IANA annotation)
 *
 * @param value - A Temporal object (PlainDate, PlainTime, PlainDateTime, or ZonedDateTime).
 * @param truncateZeroTimeInDates - If true, a PlainDateTime with all-zero time is
 *   downgraded to a PlainDate (date-only output). Has no effect on other Temporal types.
 */
export function generateTemporalDateTime(
  value: any,
  truncateZeroTimeInDates: boolean = false
): DateTime {
  const constructorName: string = value.constructor?.name ?? '';

  // Detect the Temporal type from the constructor name.
  // Supports both native ("Temporal.PlainDate") and polyfill ("PlainDate") naming.
  const isPlainDate = constructorName === 'Temporal.PlainDate' || constructorName === 'PlainDate';
  const isPlainTime = constructorName === 'Temporal.PlainTime' || constructorName === 'PlainTime';
  const isPlainDateTime = constructorName === 'Temporal.PlainDateTime' || constructorName === 'PlainDateTime';
  const isZonedDateTime = constructorName === 'Temporal.ZonedDateTime' || constructorName === 'ZonedDateTime';

  let raw: string;

  if (isPlainDate) {
    raw = value.toString();
  } else if (isPlainTime) {
    raw = value.toString();
  } else if (isPlainDateTime) {
    // Optionally truncate zero time components to date-only
    if (truncateZeroTimeInDates) {
      const T = (globalThis as any).Temporal;
      const plainDate = T.PlainDate.from(value.toString().split('T')[0]);
      if (plainDate.toString() + 'T00:00:00' === value.toString().slice(0, 19)) {
        raw = plainDate.toString();
        return {
          type: NodeType.DateTime,
          loc: { start: zero(), end: { line: 1, column: raw.length } },
          raw,
          value: plainDate
        };
      }
    }
    raw = value.toString();
  } else if (isZonedDateTime) {
    // TOML only supports offset, not IANA timezone names.
    raw = temporalToTomlString(value);
  } else {
    // Unknown Temporal type — fall back to toString()
    raw = value.toString();
  }

  return {
    type: NodeType.DateTime,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
}

export function generateInlineArray(): InlineArray {
  return {
    type: NodeType.InlineArray,
    loc: { start: zero(), end: { line: 1, column: 2 } },
    items: []
  };
}

export function generateInlineItem(item: KeyValue | Value): InlineItem {
  return {
    type: NodeType.InlineItem,
    loc: cloneLocation(item.loc),
    item,
    comma: false
  };
}

export function generateInlineTable(): InlineTable {
  return {
    type: NodeType.InlineTable,
    loc: { start: zero(), end: { line: 1, column: 2 } },
    items: []
  };
}

export function generateComment(comment: string): Comment {
  if (!comment.startsWith('#')) comment = `# ${comment}`;

  return {
    type: NodeType.Comment,
    loc: { start: zero(), end: { line: 1, column: comment.length } },
    raw: comment
  };
}
