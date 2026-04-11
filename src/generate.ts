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
 * Rebuilds a basic multiline string (`"""`) that uses line ending backslash (line-continuation)
 * formatting. Literal multiline strings (`'''`) do not support line-continuation — backslashes
 * there are always literal characters — so this function must only be called for `"""` strings.
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
 *   3. Measure the max content length from continuation lines (those ending with \).
 *      The final non-continuation tail line is excluded — it can naturally be longer.
 *   4. Greedily distribute new words across content segments using that max as the line-width
 *      limit. The last segment always receives all remaining words.
 *   5. Reassemble with the original opening format, per-line whitespace, and backslash placement.
 *
 * @param existingRaw - The full raw TOML string including delimiters (`"""`).
 * @param escaped - The new value already escaped for a basic multiline string (backslashes
 *   doubled, control characters replaced with escape sequences). This is the content that
 *   will be placed verbatim inside the rebuilt raw string.
 * @param newlineChar - The newline character to use ('\n' or '\r\n').
 * @returns The reconstructed raw TOML string.
 */
function rebuildLineContinuation(
  existingRaw: string,
  escaped: string,
  newlineChar: string
): string {
  // Line-continuation is only valid in basic multiline strings.
  const delimiter = '"""';
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
    if (/^[\t ]*$/.test(line)) {
      // Preserve the original whitespace-only line so it round-trips faithfully
      return { indent: line, content: '', trailingWs: '', hasBackslash: false, isBlank: true };
    }

    let stripped = line;
    // Count trailing backslashes: an odd count means the last one is a line-continuation
    // marker; an even count means they are all literal escaped backslashes.
    let backslashCount = 0;
    for (let i = stripped.length - 1; i >= 0 && stripped[i] === '\\'; i--) {
      backslashCount++;
    }
    const hasBackslash = backslashCount % 2 === 1;
    if (hasBackslash) {
      stripped = stripped.slice(0, -1);
    }

    const indentMatch = stripped.match(/^([\t ]*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const afterIndent = stripped.slice(indent.length);
    const trailingMatch = afterIndent.match(/([\t ]+)$/);
    const trailingWs = trailingMatch ? trailingMatch[1] : '';
    const content = afterIndent.slice(0, afterIndent.length - trailingWs.length);

    return { indent, content, trailingWs, hasBackslash, isBlank: false };
  });

  const contentSegments = segments.filter(s => !s.isBlank);

  // Measure max content width across all content lines (including the tail).
  // Width = content + trailing whitespace, because the trailing space is part of the
  // visible line before the line-continuation backslash.
  const maxLength = Math.max(...contentSegments.map(s => s.content.length + s.trailingWs.length), 1);

  // Determine which segment prototype to use for extra lines beyond the original count.
  const continuationSegs = contentSegments.filter(s => s.hasBackslash);

  // Prototypes for lines beyond the original segment count.
  const defaultProto = { indent: '', trailingWs: '', hasBackslash: false, content: '', isBlank: false };
  const contProto = continuationSegs[continuationSegs.length - 1]
    ?? contentSegments[contentSegments.length - 1]
    ?? defaultProto;
  const tailProto = contentSegments[contentSegments.length - 1] ?? contProto;

  // Record blank groups between consecutive content segments.
  // blankGroups[i] = the original blank lines (preserving their content) between
  // contentSegments[i] and [i+1].
  const blankGroups: string[][] = [];
  {
    let blanks: string[] = [];
    let ci = 0;
    for (const seg of segments) {
      if (seg.isBlank) {
        blanks.push(seg.indent);
      } else {
        if (ci > 0) blankGroups.push(blanks);
        blanks = [];
        ci++;
      }
    }
  }

  // Greedily pack content into new lines, preserving inter-word whitespace.
  // Tokenize into alternating word and space-run chunks so multiple consecutive spaces
  // are kept intact. Breaks can only occur at space-run boundaries; the space run at a
  // break point is appended to the current line as trailing whitespace before the
  // line-continuation backslash (TOML preserves trailing WS before \).
  // Always emit at least one word per line (even if it alone exceeds maxLength).
  // Add as many lines as needed — no longer constrained to the original line count.
  // Use the escaped value so backslashes and special chars are already encoded and
  // token lengths match the raw byte widths in the TOML file.
  const tokens = escaped.match(/\S+| +/g) ?? [];
  const newContentLines: string[] = [];
  let ti = 0;
  while (ti < tokens.length) {
    // Skip leading space tokens — TOML line-continuation trims leading whitespace
    while (ti < tokens.length && tokens[ti][0] === ' ') ti++;
    if (ti >= tokens.length) break;

    let line = tokens[ti++]; // always take at least one word token
    while (ti < tokens.length && tokens[ti][0] === ' ') {
      const spaceTok = tokens[ti];
      const nextWord = tokens[ti + 1];
      if (!nextWord) {
        // Trailing space with no following word — drop it
        ti++;
        break;
      }
      if (line.length + spaceTok.length + nextWord.length <= maxLength) {
        line += spaceTok + nextWord;
        ti += 2;
      } else {
        // Next word doesn't fit; append the space run so it becomes trailing
        // whitespace before the line-continuation backslash (preserved by TOML).
        line += spaceTok;
        ti++;
        break;
      }
    }
    newContentLines.push(line);
  }
  if (newContentLines.length === 0) newContentLines.push('');

  // Reassemble lines, preserving per-line indentation from original segments where available,
  // and inserting blank groups at their original inter-segment positions.
  const rebuiltLines: string[] = [];
  for (let i = 0; i < newContentLines.length; i++) {
    const isLast = i === newContentLines.length - 1;
    const origSeg = i < contentSegments.length ? contentSegments[i] : null;
    const indent = origSeg ? origSeg.indent : (isLast ? tailProto.indent : contProto.indent);
    const newContent = newContentLines[i];

    let trailing: string;
    if (isLast) {
      // Tail: always use the tail prototype's trailing whitespace and backslash —
      // when the value shrinks, origSeg may be a continuation segment whose properties
      // (hasBackslash, trailingWs) are wrong for the closing line.
      trailing = tailProto.trailingWs;
      if (newContent.length > 0 && /\s$/.test(newContent)) trailing = '';
    } else {
      // Continuation: always a trailing space as word separator, unless content ends with ws
      trailing = newContent.length > 0 && /\s$/.test(newContent) ? '' : ' ';
    }

    const backslash = isLast ? (tailProto.hasBackslash && tailProto.content !== '' ? '\\' : '') : '\\';
    rebuiltLines.push(`${indent}${newContent}${trailing}${backslash}`);

    // Emit blank lines that originally appeared after this content line index.
    if (!isLast && i < blankGroups.length && blankGroups[i].length > 0) {
      for (const blankLine of blankGroups[i]) rebuiltLines.push(blankLine);
    }
  }

  // When the tail prototype had no content, its backslash was purely structural (it only
  // skipped whitespace before the closing delimiter). In that case close inline instead
  // of preserving the closing-indent format.
  const useClosingIndent = hasClosingIndent && !(tailProto.hasBackslash && tailProto.content === '');

  if (useClosingIndent) {
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
    // Gate on the original raw delimiter — if the existing raw was literal ('''), backslashes
    // were literal characters that must never be treated as line-continuation markers, even if
    // we are converting this string to a basic string because the new value contains '''.
    let hasLineContinuation = false;
    if (existingRaw.startsWith('"""')) {
      const innerContent = existingRaw.slice(3, existingRaw.length - 3);
      hasLineContinuation = !escaped.includes(newlineChar) &&
        innerContent.split(newlineChar).some(line => {
          const m = line.match(/(\\+)$/);
          return m !== null && m[1].length % 2 === 1;
        });
    }

    // Generate the replacement raw string, preserving the structural format of the existing raw.
    if (hasLineContinuation) {
      raw = rebuildLineContinuation(existingRaw, escaped, newlineChar);
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
