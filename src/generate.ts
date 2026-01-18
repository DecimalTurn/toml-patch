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
import { zero, cloneLocation, clonePosition } from './location';
import { LocalDate } from './parse-toml';
import { TomlFormat } from './toml-format';
import { shiftNode } from './writer';
import { isMultilineString } from './utils';

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
  let raw: string;
  
  if (existingRaw && isMultilineString(existingRaw)) {
    // Preserve multiline format
    let isLiteral = existingRaw.startsWith("'''");
    
    // Literal strings cannot contain ''' - convert to basic string if needed
    if (isLiteral && value.includes("'''")) {
      isLiteral = false;
    }
    
    const delimiter = isLiteral ? "'''" : '"""';
    
    // Detect newline character from existing raw
    const newlineChar = existingRaw.includes('\r\n') ? '\r\n' : '\n';
    const hasLeadingNewline = existingRaw.startsWith(`${delimiter}${newlineChar}`) || 
                               (existingRaw.startsWith("'''") && !isLiteral && existingRaw.includes('\n'));
    
    let escaped: string;
    if (isLiteral) {
      // Literal strings: no escaping needed (we already checked for ''' above)
      escaped = value;
    } else {
      // Basic multiline strings: escape backslashes, control characters, and triple quotes
      escaped = value
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/\x08/g, '\\b') // Backspace (U+0008)
        .replace(/\f/g, '\\f')   // Form feed (U+000C)
        .replace(/\t/g, '\\t')   // Tab (U+0009)
        .replace(/[\x00-\x07\x0B\x0E-\x1F\x7F]/g, (char) => {
          // Escape other control characters
          const code = char.charCodeAt(0);
          return '\\u' + code.toString(16).padStart(4, '0').toUpperCase();
        })
        // Escape triple quotes safely: two literal quotes + escaped quote
        .replace(/"""/g, '""\\\"');
    }
    
    // Format with or without leading newline based on original
    if (hasLeadingNewline) {
      raw = `${delimiter}${newlineChar}${escaped}${delimiter}`;
    } else {
      raw = `${delimiter}${escaped}${delimiter}`;
    }
  } else {
    raw = JSON.stringify(value);
  }

  return {
    type: NodeType.String,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
}

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

export function generateDateTime(value: Date, format: TomlFormat): DateTime {
  
    // Convert Date objects with zero time components to LocalDate
    // so they are serialized as date-only in TOML
    if (format.truncateZeroTimeInDates &&
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
