/**
 * Line ending backslash (line-continuation) handling for basic multiline strings.
 *
 * In TOML, a backslash at the end of a line inside a `"""` string acts as a
 * line-continuation marker: the backslash, the following newline and any
 * leading whitespace on the next line are all trimmed, effectively joining
 * the two lines together.
 *
 * Literal multiline strings (`'''`) do NOT support this — backslashes there
 * are always literal characters.
 *
 * This module provides:
 *  - `detectLineContinuation` — checks whether an existing raw string uses
 *    line-continuation formatting.
 *  - `rebuildLineContinuation` — rebuilds the raw TOML string with a new
 *    escaped value while preserving the original line-continuation layout.
 */

interface Segment {
  indent: string;
  content: string;
  trailingWs: string;
  hasBackslash: boolean;
  isBlank: boolean;
}

/**
 * Detects whether an existing raw basic multiline string (`"""`) uses
 * line-continuation backslashes.
 *
 * Detection is gated on the original raw delimiter: if the existing raw was
 * a literal string (`'''`), backslashes were literal characters and must
 * never be treated as line-continuation markers — even when converting to a
 * basic string because the new value contains `'''`.
 *
 * The function also rejects cases where the new escaped value already contains
 * the newline character, because line-continuation is only meaningful when the
 * value is a single logical line split across multiple raw lines.
 *
 * @param existingRaw - The full raw TOML string including delimiters.
 * @param escaped - The new value already escaped for a basic multiline string.
 * @param newlineChar - The newline character used in the document (`'\n'` or `'\r\n'`).
 * @returns `true` if the existing raw string uses line-continuation formatting
 *   and the new value is compatible with it.
 */
export function detectLineContinuation(
  existingRaw: string,
  escaped: string,
  newlineChar: string
): boolean {
  if (!existingRaw.startsWith('"""')) return false;

  const innerContent = existingRaw.slice(3, existingRaw.length - 3);
  return !escaped.includes(newlineChar) &&
    innerContent.split(newlineChar).some(line => {
      const m = line.match(/(\\+)$/);
      return m !== null && m[1].length % 2 === 1;
    });
}

/**
 * Rebuilds a basic multiline string (`"""`) that uses line ending backslash
 * (line-continuation) formatting.
 *
 * Handles all three opening formats:
 *   - `"""\<NL>content\<NL>indent"""`  (leading line-continuation)
 *   - `"""<NL>content\<NL>..."""`       (leading newline)
 *   - `"""content\<NL>..."""`           (no leading newline)
 *
 * Strategy:
 *   1. Detect the opening format and where the body starts.
 *   2. Parse body lines into segments (indent, content, trailing whitespace,
 *      backslash flag), preserving blank lines.
 *   3. Measure the max content length from content lines.
 *   4. Greedily distribute new words across content segments using that max as
 *      the line-width limit.
 *   5. Reassemble with the original opening format, per-line whitespace and
 *      backslash placement.
 *
 * @param existingRaw - The full raw TOML string including delimiters (`"""`).
 * @param escaped - The new value already escaped for a basic multiline string
 *   (backslashes doubled, control characters replaced with escape sequences).
 * @param newlineChar - The newline character to use (`'\n'` or `'\r\n'`).
 * @returns The reconstructed raw TOML string, or `null` if the value cannot be
 *   represented in line-continuation format (e.g. values with leading spaces or
 *   a trailing space count that doesn't match the original layout).
 */
export function rebuildLineContinuation(
  existingRaw: string,
  escaped: string,
  newlineChar: string
): string | null {
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
  const defaultProto: Segment = { indent: '', trailingWs: '', hasBackslash: false, content: '', isBlank: false };
  const contProto = continuationSegs[continuationSegs.length - 1]
    ?? contentSegments[contentSegments.length - 1]
    ?? defaultProto;
  const tailProto = contentSegments[contentSegments.length - 1] ?? contProto;

  // Guard: line-continuation cannot faithfully represent values with leading or
  // mismatched trailing whitespace.
  //
  // Leading spaces: after the opening `"""\`, a continuation trims all whitespace
  // on the first content line — indent and content spaces are indistinguishable,
  // so any leading spaces in the value would be silently consumed.
  //
  // Trailing spaces: the reassembly inherits `tailProto.trailingWs` from the
  // original segment and places it between content and the closing `\` or `"""`.
  // This whitespace becomes part of the decoded value, so if the new value's
  // trailing space count differs from the original tail prototype, the content
  // would be silently altered.
  if (escaped.length > 0) {
    if (escaped[0] === ' ') return null;
    const trailingSpaces = escaped.length - escaped.trimEnd().length;
    if (trailingSpaces !== tailProto.trailingWs.length) return null;
  }

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
