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
 * Rebuilds a multiline string that uses line ending backslash (line-continuation) formatting.
 *
 * Handles all three opening formats:
 *   - `"""\<NL>content\<NL>indent"""`  (leading line-continuation)
 *   - `"""<NL>content\<NL>..."""`       (leading newline)
 *   - `"""content\<NL>..."""`           (no leading newline)
 *
 * Strategy:
 *   1. Detect the opening format and where the body starts.
 *   2. Parse body lines into segments (indent, content, trailing whitespace, backslash flag),
 *      preserving blank lines.
 *   3. Split both the original decoded value and the new value into words.
 *   4. Redistribute new words across the same segment structure by mapping word positions.
 *   5. Reassemble with the original opening format, per-line whitespace, and backslash placement.
 *
 * @param existingRaw - The full raw TOML string including delimiters.
 * @param escaped - The new value after escaping (for basic multiline strings).
 * @param decodedValue - The new decoded (unescaped) string value.
 * @param delimiter - The multiline delimiter ('"""' or "'''").
 * @param newlineChar - The newline character to use ('\n' or '\r\n').
 * @returns The reconstructed raw TOML string.
 */
function rebuildLineContinuation(
  existingRaw: string,
  escaped: string,
  decodedValue: string,
  delimiter: string,
  newlineChar: string
): string {
  // Determine the opening format and where the body starts
  let bodyStart: number;
  let openingPrefix: string;

  if (existingRaw.startsWith(`${delimiter}\\${newlineChar}`)) {
    // """\<NL> format — delimiter followed by line-continuation
    bodyStart = delimiter.length + 1 + newlineChar.length;
    openingPrefix = `${delimiter}\\${newlineChar}`;
  } else if (existingRaw.startsWith(`${delimiter}${newlineChar}`)) {
    // """<NL> format — delimiter followed by newline
    bodyStart = delimiter.length + newlineChar.length;
    openingPrefix = `${delimiter}${newlineChar}`;
  } else {
    // """content format — no newline after delimiter
    bodyStart = delimiter.length;
    openingPrefix = delimiter;
  }

  const bodyEnd = existingRaw.length - delimiter.length;
  const body = existingRaw.slice(bodyStart, bodyEnd);
  const rawLines = body.split(newlineChar);

  // Determine closing format: does the closing delimiter sit on its own line?
  const lastLine = rawLines[rawLines.length - 1];
  const hasClosingIndent = rawLines.length > 1 && /^[\t ]*$/.test(lastLine);
  const closingIndent = hasClosingIndent ? lastLine : '';
  const bodyLines = hasClosingIndent ? rawLines.slice(0, -1) : rawLines;

  interface Segment {
    indent: string;
    content: string;
    trailingWs: string;
    hasBackslash: boolean;
    isBlank: boolean;
  }

  const segments: Segment[] = bodyLines.map(line => {
    if (line.trim() === '') {
      return { indent: '', content: '', trailingWs: '', hasBackslash: false, isBlank: true };
    }

    let stripped = line;
    const hasBackslash = stripped.endsWith('\\');
    if (hasBackslash) {
      stripped = stripped.slice(0, -1);
    }

    const indentMatch = stripped.match(/^([\t ]*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const trailingMatch = stripped.match(/([\t ]+)$/);
    const trailingWs = trailingMatch ? trailingMatch[1] : '';
    const content = stripped.slice(indent.length, stripped.length - trailingWs.length);

    return { indent, content, trailingWs, hasBackslash, isBlank: false };
  });

  const contentSegments = segments.filter(s => !s.isBlank);

  const splitWords = (s: string): string[] => s.match(/\S+/g) || [];

  const newWords = splitWords(decodedValue);

  // Map content segments to word ranges: segmentWordRanges[i] = [startWordIdx, endWordIdx)
  const segmentWordRanges: [number, number][] = [];
  let wordIdx = 0;
  for (const seg of contentSegments) {
    const segWords = splitWords(seg.content);
    const start = wordIdx;
    wordIdx += segWords.length;
    segmentWordRanges.push([start, wordIdx]);
  }

  // Redistribute new words across content segments using the same ranges.
  const newContents: string[] = [];
  for (let i = 0; i < contentSegments.length; i++) {
    const [origStart, origEnd] = segmentWordRanges[i];
    const origCount = origEnd - origStart;
    const segNewWords =
      i === contentSegments.length - 1
        ? newWords.slice(origStart)
        : newWords.slice(origStart, origStart + origCount);
    newContents.push(segNewWords.join(' '));
  }

  // Trim trailing empty content entries (when new value has fewer words)
  while (newContents.length > 1 && newContents[newContents.length - 1] === '') {
    newContents.pop();
  }

  // Reassemble: walk segments, emitting up to the remaining content count.
  const numContentToEmit = newContents.length;
  let contentIdx = 0;
  const rebuiltLines: string[] = [];
  for (const seg of segments) {
    if (contentIdx >= numContentToEmit) break;
    if (seg.isBlank) {
      rebuiltLines.push('');
    } else {
      const newContent = newContents[contentIdx];
      let trailing = seg.trailingWs;
      if (newContent.length > 0 && /\s$/.test(newContent)) {
        trailing = '';
      }
      const backslash = seg.hasBackslash ? '\\' : '';
      rebuiltLines.push(`${seg.indent}${newContent}${trailing}${backslash}`);
      contentIdx++;
    }
  }

  if (hasClosingIndent) {
    return `${openingPrefix}${rebuiltLines.join(newlineChar)}${newlineChar}${closingIndent}${delimiter}`;
  }
  return `${openingPrefix}${rebuiltLines.join(newlineChar)}${delimiter}`;
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
    
    // Detect line-continuation backslashes anywhere in the multiline string body.
    // A line ending with an odd number of backslashes is a continuation line.
    // Line-continuation is only meaningful in basic (""") strings, not literal (''').
    const innerContent = existingRaw.slice(delimiter.length, existingRaw.length - delimiter.length);
    const hasLineContinuation = !isLiteral && !escaped.includes(newlineChar) &&
      innerContent.split(newlineChar).some(line => {
        const m = line.match(/(\\+)$/);
        return m !== null && m[1].length % 2 === 1;
      });

    // Generate the replacement raw string, preserving the structural format of the existing raw.
    if (hasLineContinuation) {
      raw = rebuildLineContinuation(existingRaw, escaped, value, delimiter, newlineChar);
    } else if (hasLeadingNewline) {
      raw = `${delimiter}${newlineChar}${escaped}${delimiter}`;
    } else {
      raw = `${delimiter}${escaped}${delimiter}`;
    }
  } else {
    raw = JSON.stringify(value);
  }

  // Calculate proper end location for multiline strings
  let endLocation;
  if (raw.includes('\r\n') || (raw.includes('\n') && !raw.includes('\r\n'))) {
    const newlineChar = raw.includes('\r\n') ? '\r\n' : '\n';
    const lineCount = (raw.match(new RegExp(newlineChar === '\r\n' ? '\\r\\n' : '\\n', 'g')) || []).length;
    
    if (lineCount > 0) {
      endLocation = {
        line: 1 + lineCount,
        column: 3 // length of delimiter (""" or ''')
      };
    } else {
      endLocation = { line: 1, column: raw.length };
    }
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
