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
import { isBasicString, isLiteralString, isMultilineLiteralString, isMultilineString } from './utils';
import { rebuildLineContinuation } from './line-ending-backslash';
import { createString, MultilineBasicString, MultilineLiteralString, StringValue, detectLineContinuation } from './string-format';

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

const IS_BARE_KEY = /^[\w-]+$/;
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
  
  if (existingRaw && isBasicString(existingRaw)) {
    return generateBasicString(value);
  }

  if (existingRaw && isLiteralString(existingRaw)) {
    if (!value.includes("'")) {
      return generateLiteralString(value);
    }
    // Value contains a single quote — single-line literal strings cannot contain '.
    // Fall back to MLLS ('''value''') unless the value also contains ''', in which
    // case we must use a basic string.
    if (!value.includes("'''")) {
      return generateMultilineLiteralString(value, existingRaw);
    }
    return generateBasicString(value);
  }

  // Note that Literal strings cannot contain ''' - fallback to basic multi-line string if needed
  if (existingRaw && isMultilineLiteralString(existingRaw)) {
    if (!value.includes("'''")) {
      return generateMultilineLiteralString(value, existingRaw);
    }
    else {
      // Need to escaped LEB in existingRaw and switch to """ instead of '''
      const escaped = existingRaw.replace(/^'''/g, '"""').replace(/\\$/gm, "\\\\");
      return generateMultilineBasicString(value, escaped);
    }
  }

  if (existingRaw && existingRaw.startsWith('"""')) {
    return generateMultilineBasicString(value, existingRaw);
  }

  // Otherwise, we don't have a format to preserve since existingRaw is either 
  // not provided or not a string, so we render as a simple basic string.
  return generateBasicString(value);
  
}

function generateBasicString(value: string): String {
  const raw = JSON.stringify(value);
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
    const newlineChar = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(newlineChar);
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
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/\x08/g, '\\b')
    .replace(/\f/g, '\\f')
    .replace(/\t/g, '\\t')
    .replace(/[\x00-\x07\x0B\x0E-\x1F\x7F]/g, (char) => {
      const code = char.charCodeAt(0);
      return '\\u' + code.toString(16).padStart(4, '0').toUpperCase();
    })
    .replace(/"""/g, '""\\\"');

  const leadingNewLine = existingRaw.startsWith('"""\r\n')
    ? '\r\n'
    : existingRaw.startsWith('"""\n')
    ? '\n'
    : '';

  let raw = '"""' + leadingNewLine + escaped + '"""';
  
  if (detectLineContinuation(new MultilineBasicString(existingRaw))) {
    const rebuilt = rebuildLineContinuation(existingRaw, escaped);
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

function generateMultilineLiteralString(value: string, existingRaw: string): String {

  const leadingNewLine = existingRaw.startsWith("'''\r\n")
    ? '\r\n'
    : existingRaw.startsWith("'''\n")
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
    const newlineChar = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(newlineChar);
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
