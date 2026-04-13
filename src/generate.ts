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
import { shiftNode } from './writer';
import { isBasicString, isLiteralString, isMultilineString } from './utils';
import { detectLineContinuation, rebuildLineContinuation } from './line-ending-backslash';

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
  let raw = '';





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
      return generateMultilineLiteralString(value);
    }
    return generateBasicString(value);
  }

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
                               ((existingRaw.startsWith("'''\n") || existingRaw.startsWith("'''\r\n")) && !isLiteral);

    // The value's newlines are preserved as-is when using the LC escape-sequence path
    // (where newlines are encoded as TOML \n / \r\n escapes, not embedded literally).
    // The fallback paths embed newlines as literal source text, so they must normalize
    // to the document's line ending to keep the file structurally consistent.
    const normalizedValue = value.replace(/\r?\n/g, newlineChar);

    let escaped: string;
    if (isLiteral) {
      // Literal strings: no escaping needed (we already checked for ''' above)
      escaped = normalizedValue;
    } else {
      // Basic multiline strings: escape backslashes, control characters, and triple quotes.
      // Build escapedRaw from normalizedValue (for fallback literal paths) and
      // escapedOriginal from value (for the LC path which uses TOML escape sequences).
      escaped = normalizedValue
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

    // For the LC path, escape value without newline normalization so the LC function
    // can encode them as TOML escape sequences (\n, \r\n) and preserve the exact value.
    const escapedOriginal = isLiteral ? value : value
      .replace(/\\/g, '\\\\')
      .replace(/\x08/g, '\\b')
      .replace(/\f/g, '\\f')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x07\x0B\x0E-\x1F\x7F]/g, (char) => {
        const code = char.charCodeAt(0);
        return '\\u' + code.toString(16).padStart(4, '0').toUpperCase();
      })
      .replace(/"""/g, '""\\\"');
    
    // Detect line-continuation backslashes anywhere in the multiline string body.
    // Line-continuation is only meaningful in basic (""") strings, not literal (''').
    // `rebuildLineContinuation` handles newlines in `escaped` internally: it either
    // splits on double-newlines (paragraph style) or encodes them as \n escape sequences.
    const hasLineContinuation = detectLineContinuation(existingRaw, newlineChar);

    // Generate the replacement raw string, preserving the structural format of the existing raw.
    if (hasLineContinuation) {
      const rebuilt = rebuildLineContinuation(existingRaw, escapedOriginal, newlineChar);
      if (rebuilt !== null) {
        raw = rebuilt;
      }
    }
    if (!raw && hasLeadingNewline) {
      raw = `${delimiter}${newlineChar}${escaped}${delimiter}`;
    } else if (!raw) {
      raw = `${delimiter}${escaped}${delimiter}`;
    }
  } else {
    raw = JSON.stringify(value);
  }

  // Calculate proper end location for multiline strings
  let endLocation;
  if (raw.includes('\n')) {
    const newlineChar = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(newlineChar);
    const lastLine = lines[lines.length - 1];
    endLocation = {
      line: lines.length,
      // Use the actual last line length: when """ closes on its own line this
      // equals 3 (the delimiter), but when content precedes the closing """
      // (no-leading-newline format, e.g. """Hello\nWorld""") it's larger.
      column: lastLine.length
    };

  } else {
    // Covers both regular basic strings (e.g. "hello") and mlbs whose generated raw
    // contains no newline — e.g. """single line value""" produced when the original
    // had no leading newline and the new value itself has no newlines. In that case
    // the entire raw string sits on one line, so column = raw.length is correct.
    // (column: 3 would be wrong here — that only applies when """ closes on its own line.)
    endLocation = { line: 1, column: raw.length };
  }

  return {
    type: NodeType.String,
    loc: { start: zero(), end: endLocation },
    raw,
    value
  };
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
  return {
    type: NodeType.String,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
}

function generateMultilineBasicString(value: string): String {
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
  const raw = `"""${escaped}"""`;
  return {
    type: NodeType.String,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
}

function generateMultilineLiteralString(value: string): String {
  const raw = `'''${value}'''`;
  return {
    type: NodeType.String,
    loc: { start: zero(), end: { line: 1, column: raw.length } },
    raw,
    value
  };
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
