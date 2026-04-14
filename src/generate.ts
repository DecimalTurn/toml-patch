/**
 * @file Helpers to generate and update TOML AST nodes.
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
} from './ast';
import { zero, cloneLocation, clonePosition, Location, Position } from './location';
import { LocalDate } from './parse-toml';
import { shiftNode } from './writer';
import { rebuildLineContinuation } from './line-ending-backslash';
import { MultilineBasicString, MultilineLiteralString, detectLineContinuation, rawStringWrapper, LiteralString, BasicString } from './string-format';
import { IS_BARE_KEY } from './tokenizer';
import { escapeStringContent } from './escape-preference';

function detectFirstLineEnding(value: string): '\r\n' | '\n' | '' {
  const match = value.match(/\r\n|\n/);
  return (match?.[0] as '\r\n' | '\n' | undefined) ?? '';
}

function normalizeActualLineEndings(value: string, newlineChar: '\r\n' | '\n'): string {
  return value.replace(/\r\n/g, '\n').replace(/\n/g, newlineChar);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled string type for existing raw value: ${String(value)}`);
}

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

function keyValueToRaw(value: string[]): string {
  return value.map(part => (IS_BARE_KEY.test(part) ? part : JSON.stringify(part))).join('.');
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
  const existingStringValue = rawStringWrapper(existingRaw);

  if (existingStringValue === null) {
    // existingRaw is misformatted. This should be impossible
    throw new Error(`Existing raw string value is not valid: ${existingRaw}`);
  }

  switch (existingStringValue.type) {
    case 'basic':
      return generateBasicString(value, existingRaw);

    case 'literal':
      if (!value.includes("'")) {
        return generateLiteralString(value);
      }
      // Value contains a single quote — single-line literal strings cannot contain '.
      // Fall back to MLLS ('''value''') unless the value also contains ''', in which
      // case we must use a basic string.
      if (!value.includes("'''")) {
        return generateMultilineLiteralString(value, MultilineLiteralString.fromLiteralString(existingStringValue));
      }
      return generateBasicString(value);

    case 'multiline-literal':
      // Literal strings cannot contain ''' - fallback to basic multi-line string if needed
      if (!value.includes("'''")) {
        return generateMultilineLiteralString(value, existingStringValue);
      }
      return generateMultilineBasicString(value, MultilineBasicString.fromMultilineLiteralString(existingStringValue));

    case 'multiline-basic':
      return generateMultilineBasicString(value, existingStringValue);

    default:
      return assertNever(existingStringValue);
  }
}

function generateBasicString(value: string, existingRaw?: string): String {
  let raw = '';
  if (!existingRaw) {
    raw = JSON.stringify(value);
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

function generateMultilineBasicString(value: string, existingRaw: MultilineBasicString): String {
  const escaped = escapeStringContent(value, existingRaw.raw, 'multiline-basic');
  const structuralNewline = detectFirstLineEnding(existingRaw.raw) || '\n';

  const leadingNewLine = existingRaw.raw.startsWith('"""\r\n')
    ? '\r\n'
    : existingRaw.raw.startsWith('"""\n')
    ? '\n'
    : '';

  let raw = '"""' + leadingNewLine + normalizeActualLineEndings(escaped, structuralNewline) + '"""';
  
  if (detectLineContinuation(existingRaw)) {
    const rebuilt = rebuildLineContinuation(existingRaw.raw, escaped);
    if (rebuilt !== null) {
      raw = rebuilt;
    }
  }

  const endLocation = endlocation(new MultilineBasicString(raw));

  return {
    type: NodeType.String,
    loc: { start: zero(), end: endLocation },
    raw,
    value
  };
}

function generateMultilineLiteralString(value: string, existingRaw: MultilineLiteralString): String {

  const leadingNewLine = existingRaw.raw.startsWith("'''\r\n")
    ? '\r\n'
    : existingRaw.raw.startsWith("'''\n")
    ? '\n'
    : '';

  const raw = "'''" + leadingNewLine + value + "'''";
  const endLocation = endlocation(new MultilineLiteralString(raw));
  return {
    type: NodeType.String,
    loc: { start: zero(), end: endLocation },
    raw,
    value
  };
}

function endlocation (stringValue: MultilineBasicString | MultilineLiteralString): Position {
  const raw = stringValue.raw;
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
export function generateInteger(value: number): Integer {
  const raw = value.toString();
  return {
    type: NodeType.Integer,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
}

export function generateFloat(value: number): Float {
  let raw: string;
  
  if (value === Infinity) {
    raw = 'inf';
  } else if (value === -Infinity) {
    raw = '-inf';
  } else if (Number.isNaN(value)) {
    raw = 'nan';
  } else if (Object.is(value, -0)) {
    raw = '-0.0';
  } else {
    raw = value.toString();
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
