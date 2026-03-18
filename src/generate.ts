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
 * Given an existing raw TOML string like:
 *   """\
 *           Hello \
 *           World.\
 *           """
 *
 * and a new decoded value like "Bonjour World.", this function:
 *   1. Parses the existing raw into per-line segments, extracting each segment's indent
 *      and trailing whitespace.
 *   2. Splits both the original decoded value and the new value into words.
 *   3. Redistributes the new words across the original line structure by mapping words
 *      at each segment boundary.
 *   4. Reassembles with `\<LF><indent>` between segments and `\<LF><closingIndent>"""` at the end.
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
  // Parse the body: everything between `"""\<LF>` and `"""`
  const bodyStart = delimiter.length + 1 /* \ */ + newlineChar.length;
  const bodyEnd = existingRaw.length - delimiter.length;
  const body = existingRaw.slice(bodyStart, bodyEnd);

  // Split the body into raw lines
  const rawLines = body.split(newlineChar);

  // The last raw line is the closing indent (whitespace before the closing """)
  const closingIndent = rawLines[rawLines.length - 1];

  // Content lines are all lines except the last one (the closing indent line).
  // Each content line has the format: <indent><content><trailing-ws>\
  const contentLines = rawLines.slice(0, -1);

  // Parse each content line into { indent, content, trailingWs }
  interface Segment {
    indent: string;
    content: string;
    trailingWs: string;
  }

  const segments: Segment[] = contentLines.map(line => {
    // Strip the trailing backslash (the line-continuation character)
    let stripped = line;
    if (stripped.endsWith('\\')) {
      stripped = stripped.slice(0, -1);
    }

    // Extract leading whitespace (indent)
    const indentMatch = stripped.match(/^([\t ]*)/);
    const indent = indentMatch ? indentMatch[1] : '';

    // Extract trailing whitespace
    const trailingMatch = stripped.match(/([\t ]+)$/);
    const trailingWs = trailingMatch ? trailingMatch[1] : '';

    // The content is what's between the indent and the trailing whitespace
    const content = stripped.slice(indent.length, stripped.length - trailingWs.length);

    return { indent, content, trailingWs };
  });

  // Split into "words" (non-whitespace tokens) for mapping between old and new values.
  const splitWords = (s: string): string[] => {
    const matches = s.match(/\S+/g);
    return matches || [];
  };

  const originalWords = splitWords(segments.map(s => s.content).join(''));
  const newWords = splitWords(decodedValue);

  // If there's only one segment or no words to match, use a simple single-line rebuild
  if (segments.length <= 1 || originalWords.length === 0) {
    let escapedInline = escaped;
    if (escapedInline.endsWith('\r\n')) escapedInline = escapedInline.slice(0, -2);
    else if (escapedInline.endsWith('\n')) escapedInline = escapedInline.slice(0, -1);

    const seg = segments[0] || { indent: '', trailingWs: ' ' };
    return `${delimiter}\\${newlineChar}${seg.indent}${escapedInline}\\${newlineChar}${closingIndent}${delimiter}`;
  }

  // For each segment, determine which original words it contains.
  // segmentWordRanges[i] = [startWordIdx, endWordIdx)
  const segmentWordRanges: [number, number][] = [];
  let wordIdx = 0;
  for (const seg of segments) {
    const segWords = splitWords(seg.content);
    const start = wordIdx;
    wordIdx += segWords.length;
    segmentWordRanges.push([start, wordIdx]);
  }

  // Redistribute the new words across segments using the same ranges.
  const newSegments: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const [origStart, origEnd] = segmentWordRanges[i];
    const origCount = origEnd - origStart;

    let segNewWords: string[];
    if (i === segments.length - 1) {
      // Last content segment gets all remaining words
      segNewWords = newWords.slice(origStart);
    } else {
      segNewWords = newWords.slice(origStart, origStart + origCount);
    }

    newSegments.push(segNewWords.join(' '));
  }

  // Remove trailing empty segments (in case the new value has fewer words)
  while (newSegments.length > 1 && newSegments[newSegments.length - 1] === '') {
    newSegments.pop();
  }

  // Reassemble the raw string
  const rebuiltLines: string[] = [];
  for (let i = 0; i < newSegments.length; i++) {
    const seg = i < segments.length ? segments[i] : segments[segments.length - 1];
    // Preserve trailing whitespace from the original segment, but don't double up
    // if the new content already ends with whitespace.
    let trailing = seg.trailingWs;
    if (newSegments[i].length > 0 && /\s$/.test(newSegments[i])) {
      trailing = '';
    }
    rebuiltLines.push(`${seg.indent}${newSegments[i]}${trailing}\\`);
  }

  return `${delimiter}\\${newlineChar}${rebuiltLines.join(newlineChar)}${newlineChar}${closingIndent}${delimiter}`;
}

/**
 * Rebuilds a multiline string that uses the `"""<NL>` (leading newline) format and contains
 * line-continuation backslashes within the body.
 *
 * Given an existing raw TOML string like:
 *   """
 *   The quick brown \
 *
 *
 *     fox jumps over \
 *       the lazy dog."""
 *
 * and a new decoded value like "The quick brown cat jumps over the lazy dog.", this function
 * preserves the line structure (including blank lines) while redistributing new words across
 * the same content-line positions.
 */
function rebuildLeadingNewlineContinuation(
  existingRaw: string,
  escaped: string,
  decodedValue: string,
  delimiter: string,
  newlineChar: string
): string {
  const bodyStart = delimiter.length + newlineChar.length;
  const bodyEnd = existingRaw.length - delimiter.length;
  const body = existingRaw.slice(bodyStart, bodyEnd);

  const rawLines = body.split(newlineChar);

  // Check if the last line is a closing indent (pure whitespace) vs content.
  const lastLine = rawLines[rawLines.length - 1];
  const hasClosingIndent = /^[\t ]*$/.test(lastLine);
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

  const originalWords = splitWords(contentSegments.map(s => s.content).join(''));
  const newWords = splitWords(decodedValue);

  // Map content segments to word ranges.
  const segmentWordRanges: [number, number][] = [];
  let wordIdx = 0;
  for (const seg of contentSegments) {
    const segWords = splitWords(seg.content);
    const start = wordIdx;
    wordIdx += segWords.length;
    segmentWordRanges.push([start, wordIdx]);
  }

  // Redistribute new words across content segments.
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

  // Reassemble: walk all segments (including blanks), replacing content in non-blank ones.
  let contentIdx = 0;
  const rebuiltLines: string[] = [];
  for (const seg of segments) {
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
    return `${delimiter}${newlineChar}${rebuiltLines.join(newlineChar)}${newlineChar}${closingIndent}${delimiter}`;
  }
  return `${delimiter}${newlineChar}${rebuiltLines.join(newlineChar)}${delimiter}`;
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
    // Detect the """\<LF> opening: delimiter immediately followed by a line-continuation backslash.
    // This is distinct from hasLeadingNewline (delimiter immediately followed by a bare newline).
    const hasLeadingLineContinuation =
      !hasLeadingNewline && existingRaw.startsWith(`${delimiter}\\${newlineChar}`);
    
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
    
    // Generate the replacement raw string, preserving the structural format of the existing raw.
    if (hasLeadingLineContinuation) {
      // Format: """\<LF>INDENT CONTENT \<LF>INDENT CONTENT \<LF>INDENT"""
      // Each `\<LF><whitespace>` is a line continuation: it trims the backslash, newline,
      // and all following whitespace, joining content segments into a single decoded value.
      //
      // Strategy:
      //   1. Parse the existing raw body into segments (one per continuation line).
      //   2. Extract each segment's indent and trailing whitespace.
      //   3. Split both the original decoded value and the new value into words.
      //   4. Redistribute the new words across the same number of segments by matching
      //      word positions from the original, preserving per-segment whitespace.
      //   5. Reassemble with `\<LF>` between segments.
      raw = rebuildLineContinuation(existingRaw, escaped, value, delimiter, newlineChar);
    } else if (hasLeadingNewline) {
      const bodyStart = delimiter.length + newlineChar.length;
      const bodyEnd = existingRaw.length - delimiter.length;
      const existingBody = existingRaw.slice(bodyStart, bodyEnd);

      // Detect line-continuation backslashes in the body: any line ending with an odd
      // number of backslashes is a continuation line.
      const bodyLines = existingBody.split(newlineChar);
      const hasContinuationLines = !escaped.includes(newlineChar) &&
        bodyLines.some(line => {
          const m = line.match(/(\\+)$/);
          return m !== null && m[1].length % 2 === 1;
        });

      if (hasContinuationLines) {
        raw = rebuildLeadingNewlineContinuation(existingRaw, escaped, value, delimiter, newlineChar);
      } else {
        raw = `${delimiter}${newlineChar}${escaped}${delimiter}`;
      }
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
