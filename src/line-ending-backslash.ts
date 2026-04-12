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
 * The function only inspects `existingRaw` — it does not check the new value.
 * Compatibility with the new value (e.g. newline handling) is determined inside
 * `rebuildLineContinuation`.
 *
 * @param existingRaw - The full raw TOML string including delimiters.
 * @param newlineChar - The newline character used in the document (`'\n'` or `'\r\n'`).
 * @returns `true` if the existing raw string uses line-continuation formatting.
 */
export function detectLineContinuation(
  existingRaw: string,
  newlineChar: string
): boolean {
  if (!existingRaw.startsWith('"""')) return false;

  const innerContent = existingRaw.slice(3, existingRaw.length - 3);
  return innerContent.split(newlineChar).some(line => {
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
 *   4. Detect "blank-line paragraph style": if the original uses blank lines to
 *      separate paragraphs (non-backslash content line followed by a blank line),
 *      split the new value on double-newlines and pack each paragraph separately,
 *      rejoined by blank lines.
 *   5. Otherwise, encode newlines as `\n` escape sequences and pack as a single group.
 *   6. Reassemble with the original opening format, per-line whitespace and
 *      backslash placement.
 *
 * @param existingRaw - The full raw TOML string including delimiters (`"""`).
 * @param escaped - The new value already escaped for a basic multiline string
 *   (backslashes doubled, control characters replaced with escape sequences).
 *   May contain real newline characters; this function handles their encoding.
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
  // Normalize existingRaw to the document's line ending so mixed-ending source
  // files are handled consistently. Replace all CRLF first, then any remaining
  // bare LF, then re-introduce the correct sequence.
  existingRaw = existingRaw.replace(/\r\n/g, '\n').replace(/\n/g, newlineChar);

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

    const indent = stripped.match(/^[\t ]*/)?.[0] ?? '';
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
  // When the opening is `"""\<NL>`, the continuation backslash is part of the opening
  // prefix (not the body), so continuationSegs and even contentSegments can be empty.
  const continuationSegs = contentSegments.filter(s => s.hasBackslash);
  const defaultProto: Segment = { indent: '', trailingWs: '', hasBackslash: false, content: '', isBlank: false };
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

  // Detect literal line-break style in the original source: a non-tail content segment
  // without a trailing backslash means the next newline is semantic (not line-continuation).
  // When present, we prefer preserving real source line breaks from the new value and avoid
  // turning them into \n escapes where possible.
  const hasLiteralLineBreakStyle = contentSegments.some((seg, i) =>
    !seg.hasBackslash && i < contentSegments.length - 1
  );

  const isLeadingNewlineOpening = openingPrefix === `${delimiter}${newlineChar}`;
  // In `"""<NL>` mode, derive the first-line indent from the value's own leading
  // whitespace so packing sees only "content". In `"""\<NL>` mode there is no
  // structural indent, so any leading space in the value must be rejected.
  const newFirstIndent = isLeadingNewlineOpening && contentSegments.length > 0
    ? escaped.match(/^[\t ]*/)?.[0] ?? ''
    : '';

  // Helper: greedy word-packer. Splits content at whitespace boundaries to honour
  // maxLength, appending the whitespace run as trailing ws before the line-continuation.
  const packContent = (input: string): string[] => {
    const tokens = input.match(/\S+| +/g) ?? [];
    const lines: string[] = [];
    let ti = 0;
    while (ti < tokens.length) {
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
      lines.push(line);
    }
    if (lines.length === 0) lines.push('');
    return lines;
  };

  // Flat list of packed content strings and a set tracking logical line boundaries
  // (last packed line of a non-last logical line — no backslash).
  const newContentLines: string[] = [];
  // Reassembly buffer — populated either by the prefix-preservation early path or
  // by the main reassembly loop below.
  const rebuiltLines: string[] = [];
  const paraEndIndices = new Set<number>();
  const logicalLineStartIndices = new Set<number>();
  const logicalLineStartIndentByIndex = new Map<number, string>();
  let isLiteralLineBreakPath = false;

  // Guard: only use the literal-break path when the value's newlines are exactly
  // newlineChar. A CRLF value in an LF doc would have `escaped.includes('\n')` true
  // (since \r\n contains \n), but splitting on bare '\n' would leave stray \r at
  // the end of lines. So for LF docs, require the value has no \r\n sequences.
  const canUseLiteralBreak = hasLiteralLineBreakStyle && escaped.includes(newlineChar) &&
    (newlineChar === '\r\n' || !escaped.includes('\r\n'));

  if (canUseLiteralBreak) {
    // ── Literal line-break path ────────────────────────────────────────────────
    // Keep actual source newlines from the new value. Each logical line is packed
    // independently and boundaries are emitted as real line breaks (no backslash).
    // Since value newlines are not normalized, the decoded value preserves whatever
    // newline sequence was in the original JS value.
    isLiteralLineBreakPath = true;
    const logicalLines = escaped.split(newlineChar);

    // Guard: first logical line's content must not start with a space after stripping
    // the structural first-line indent.
    const firstLineInput = logicalLines[0].slice(newFirstIndent.length);
    if (firstLineInput.length > 0 && firstLineInput[0] === ' ') return null;

    // Guard: final logical line's trailing space count must match tailProto.
    const lastLineInput = logicalLines[logicalLines.length - 1];
    if (lastLineInput.length > 0) {
      const trailingSpaces = lastLineInput.length - lastLineInput.trimEnd().length;
      if (trailingSpaces !== tailProto.trailingWs.length) return null;
    }

    for (let li = 0; li < logicalLines.length; li++) {
      const rawLine = logicalLines[li];
      const adjusted = li === 0 ? rawLine.slice(newFirstIndent.length) : rawLine;
      const logicalLineIndent = adjusted.match(/^[\t ]*/)?.[0] ?? '';
      const logicalLineContent = adjusted.slice(logicalLineIndent.length);
      const packedLines = packContent(logicalLineContent);
      const startIdx = newContentLines.length;
      logicalLineStartIndices.add(startIdx);
      if (li > 0) {
        // For literal line boundaries, preserve the next logical line's leading spaces
        // as actual source indentation on that boundary line.
        logicalLineStartIndentByIndex.set(startIdx, logicalLineIndent);
      }
      for (const l of packedLines) newContentLines.push(l);
      if (li < logicalLines.length - 1) {
        // Mark the last packed line of this non-last logical line.
        paraEndIndices.add(startIdx + packedLines.length - 1);
      }
    }
  } else {
    // ── Single-group path ────────────────────────────────────────────────────────
    // Encode newlines as TOML escape sequences so the decoded value exactly preserves
    // whatever newline sequence was in the original JS value. Encode \r\n first so
    // that the subsequent bare-\n pass doesn't double-encode the \n half of CRLF.
    const packInput = escaped
      .replace(/\r\n/g, '\\r\\n')
      .replace(/\n/g, '\\n')
      .slice(newFirstIndent.length);

    // Guard: leading space would be silently consumed by LC indent mechanics.
    if (packInput.length > 0) {
      if (packInput[0] === ' ') return null;
      const trailingSpaces = packInput.length - packInput.trimEnd().length;
      if (trailingSpaces !== tailProto.trailingWs.length) return null;
    }

    // ── Prefix + suffix preservation ────────────────────────────────────────────
    // Identify unchanged leading and trailing segments so only the genuinely changed
    // middle slice needs to be repacked. This prevents a word swap in the middle (or
    // even at the very start) from pulling words out of later unchanged lines due to
    // the global maxLength being measured from the longest line in the string.
    if (!hasLiteralLineBreakStyle) {
      // Prefix: count segments from the start whose content+trailingWs appears
      // verbatim at the beginning of packInput.
      let preservedCount = 0;
      let consumedChars = 0;
      // Only consider segments up to (but not including) the tail segment.
      for (let k = 0; k < contentSegments.length - 1; k++) {
        const seg = contentSegments[k];
        if (!seg.hasBackslash) break; // non-continuation inner segment — stop
        const contrib = seg.content + seg.trailingWs;
        if (packInput.slice(consumedChars, consumedChars + contrib.length) === contrib) {
          preservedCount++;
          consumedChars += contrib.length;
        } else {
          break;
        }
      }

      // Suffix: working backwards from the tail, count segments whose content+trailingWs
      // appears verbatim at the END of packInput (not overlapping the prefix).
      // Structural segments with no content (e.g. a blank closing-indent segment) are
      // not matchable — they would always match the empty string and corrupt the output.
      let suffixCount = 0;
      let suffixChars = 0;
      for (let k = contentSegments.length - 1; k >= preservedCount; k--) {
        const seg = contentSegments[k];
        const contrib = seg.content + seg.trailingWs;
        if (contrib.length === 0) break; // structural segment — stop
        const start = packInput.length - suffixChars - contrib.length;
        if (start >= consumedChars && packInput.slice(start, start + contrib.length) === contrib) {
          suffixCount++;
          suffixChars += contrib.length;
        } else {
          break;
        }
      }

      // ── Prefix + middle + suffix early return ──────────────────────────────
      // Used when the suffix is non-empty. Pack only the changed middle section
      // using a local width budget derived from the original middle segments, so
      // the middle lines cannot absorb words that belong to the unchanged suffix.
      if (suffixCount > 0) {
        const middleInput = packInput.slice(consumedChars, packInput.length - suffixChars);
        // Guard: middle must not start with a space.
        if (middleInput.length === 0 || middleInput[0] !== ' ') {
          // 1. Emit preserved prefix lines verbatim (all have continuation backslash).
          for (let i = 0; i < preservedCount; i++) {
            const seg = contentSegments[i];
            rebuiltLines.push(`${seg.indent}${seg.content}${seg.trailingWs}\\`);
            if (i < preservedCount - 1 && i < blankGroups.length && blankGroups[i].length > 0) {
              for (const bl of blankGroups[i]) rebuiltLines.push(bl);
            }
          }

          // 2. Pack and emit the middle section (all lines need continuation backslash
          //    because the suffix follows).
          if (middleInput.length > 0) {
            const midLines = packContent(middleInput);
            const joinedMid = midLines.join('');
            const hasEncodedNewlines = /(?<!\\)\\n/.test(joinedMid);
            // Blank group bridging last prefix segment and first middle line.
            if (preservedCount > 0 && !hasEncodedNewlines) {
              const bridgeIdx = preservedCount - 1;
              if (bridgeIdx < blankGroups.length && blankGroups[bridgeIdx].length > 0) {
                for (const bl of blankGroups[bridgeIdx]) rebuiltLines.push(bl);
              }
            }
            for (let j = 0; j < midLines.length; j++) {
              const newContent = midLines[j];
              const origIdx = preservedCount + j;
              const origSeg = origIdx < contentSegments.length ? contentSegments[origIdx] : null;
              const indent = origSeg
                ? (isLeadingNewlineOpening && origIdx === 0 ? newFirstIndent : origSeg.indent)
                : contProto.indent;
              const trailing = newContent.length > 0 && /\s$/.test(newContent) ? '' : ' ';
              rebuiltLines.push(`${indent}${newContent}${trailing}\\`);
              if (j < midLines.length - 1 && !hasEncodedNewlines) {
                const bgIdx = preservedCount + j;
                if (bgIdx < blankGroups.length && blankGroups[bgIdx].length > 0) {
                  for (const bl of blankGroups[bgIdx]) rebuiltLines.push(bl);
                }
              }
            }
            // Blank group between the last middle line and the first suffix segment.
            const midToSuffixBgIdx = contentSegments.length - suffixCount - 1;
            if (!hasEncodedNewlines &&
                midToSuffixBgIdx >= 0 && midToSuffixBgIdx < blankGroups.length &&
                blankGroups[midToSuffixBgIdx].length > 0) {
              for (const bl of blankGroups[midToSuffixBgIdx]) rebuiltLines.push(bl);
            }
          } else if (preservedCount > 0) {
            // Empty middle: blank group bridging last prefix and first suffix.
            const bridgeIdx = preservedCount - 1;
            if (bridgeIdx < blankGroups.length && blankGroups[bridgeIdx].length > 0) {
              for (const bl of blankGroups[bridgeIdx]) rebuiltLines.push(bl);
            }
          }

          // 3. Emit preserved suffix lines verbatim.
          const suffixStart = contentSegments.length - suffixCount;
          for (let i = suffixStart; i < contentSegments.length; i++) {
            const seg = contentSegments[i];
            const isTail = i === contentSegments.length - 1;
            // Blank group between consecutive suffix segments (not the middle-to-first-suffix
            // bridge, which was handled above).
            if (i > suffixStart) {
              const bgIdx = i - 1;
              if (bgIdx < blankGroups.length && blankGroups[bgIdx].length > 0) {
                for (const bl of blankGroups[bgIdx]) rebuiltLines.push(bl);
              }
            }
            rebuiltLines.push(isTail
              ? `${seg.indent}${seg.content}${seg.trailingWs}${seg.hasBackslash && seg.content !== '' ? '\\' : ''}`
              : `${seg.indent}${seg.content}${seg.trailingWs}\\`);
          }

          const useClosingIndentEarly = hasClosingIndent && !(tailProto.hasBackslash && tailProto.content === '');
          if (useClosingIndentEarly) {
            return `${openingPrefix}${rebuiltLines.join(newlineChar)}${newlineChar}${closingIndent}${delimiter}`;
          }
          return `${openingPrefix}${rebuiltLines.join(newlineChar)}${delimiter}`;
        }
      }

      // ── Prefix-only early return ────────────────────────────────────────────
      // Used when the suffix is empty but the prefix is non-empty. Packs the
      // remaining (changed) tail portion at the global maxLength.
      const remainingInput = packInput.slice(consumedChars);
      if (
        preservedCount > 0 &&
        (consumedChars === packInput.length ||
          (remainingInput.length > 0 && remainingInput[0] !== ' '))
      ) {
        // Emit preserved original continuation lines verbatim.
        for (let i = 0; i < preservedCount; i++) {
          const seg = contentSegments[i];
          rebuiltLines.push(`${seg.indent}${seg.content}${seg.trailingWs}\\`);
          // Emit blank groups that fall between preserved segments.
          if (i < preservedCount - 1 && i < blankGroups.length && blankGroups[i].length > 0) {
            for (const bl of blankGroups[i]) rebuiltLines.push(bl);
          }
        }

        if (consumedChars === packInput.length) {
          // The new content ends exactly at the last preserved segment boundary.
          // Convert the last preserved line from continuation to tail.
          const lastSeg = contentSegments[preservedCount - 1];
          const backslash = tailProto.hasBackslash && lastSeg.content !== '' ? '\\' : '';
          rebuiltLines[rebuiltLines.length - 1] =
            `${lastSeg.indent}${lastSeg.content}${tailProto.trailingWs}${backslash}`;
        } else {
          // Pack only the remaining (changed) portion of the content.
          const newPackedLines = packContent(remainingInput);
          const joinedNew = newPackedLines.join('');
          const hasEncodedNewlines = /(?<!\\)\\n/.test(joinedNew);
          // Emit blank group bridging the last preserved segment and the first new line.
          const bridgeIdx = preservedCount - 1;
          if (!hasEncodedNewlines && bridgeIdx < blankGroups.length && blankGroups[bridgeIdx].length > 0) {
            for (const bl of blankGroups[bridgeIdx]) rebuiltLines.push(bl);
          }
          for (let j = 0; j < newPackedLines.length; j++) {
            const isLastNew = j === newPackedLines.length - 1;
            const newContent = newPackedLines[j];
            const origIdx = preservedCount + j;
            const origSeg = origIdx < contentSegments.length ? contentSegments[origIdx] : null;
            const indent = origSeg
              ? (isLeadingNewlineOpening && origIdx === 0 ? newFirstIndent : origSeg.indent)
              : (isLastNew ? tailProto.indent : contProto.indent);
            let trailing: string;
            let backslash: string;
            if (isLastNew) {
              trailing = tailProto.trailingWs;
              backslash = tailProto.hasBackslash && tailProto.content !== '' ? '\\' : '';
            } else {
              trailing = newContent.length > 0 && /\s$/.test(newContent) ? '' : ' ';
              backslash = '\\';
            }
            rebuiltLines.push(`${indent}${newContent}${trailing}${backslash}`);
            // Emit blank groups for the new lines (index offset by preservedCount).
            if (!isLastNew) {
              const bgIdx = preservedCount + j;
              if (!hasEncodedNewlines && bgIdx < blankGroups.length && blankGroups[bgIdx].length > 0) {
                for (const bl of blankGroups[bgIdx]) rebuiltLines.push(bl);
              }
            }
          }
        }

        const useClosingIndentEarly = hasClosingIndent && !(tailProto.hasBackslash && tailProto.content === '');
        if (useClosingIndentEarly) {
          return `${openingPrefix}${rebuiltLines.join(newlineChar)}${newlineChar}${closingIndent}${delimiter}`;
        }
        return `${openingPrefix}${rebuiltLines.join(newlineChar)}${delimiter}`;
      }
    }

    const packed = packContent(packInput);
    for (const l of packed) newContentLines.push(l);
  }

  // Reassemble lines with correct indentation, trailing whitespace and backslash placement.
  for (let i = 0; i < newContentLines.length; i++) {
    const isGlobalLast = i === newContentLines.length - 1;
    const isParaEnd = paraEndIndices.has(i);
    // Paragraph-end lines and the global last line both use tail-like properties:
    // no backslash, tailProto trailing whitespace.
    const isTailLike = isGlobalLast || isParaEnd;

    const origSeg = i < contentSegments.length ? contentSegments[i] : null;
    // In `"""<NL>` mode the first segment's indent is part of the decoded value, so
    // we use the new value's own leading whitespace (newFirstIndent) for i === 0,
    // letting the value's leading whitespace differ from the original freely.
    const indent = isLiteralLineBreakPath && logicalLineStartIndices.has(i) && i > 0
      ? (logicalLineStartIndentByIndex.get(i) ?? '')
      : (origSeg
        ? (isLeadingNewlineOpening && i === 0 ? newFirstIndent : origSeg.indent)
        : (isTailLike ? tailProto.indent : contProto.indent));
    const newContent = newContentLines[i];

    let trailing: string;
    let backslash: string;
    if (isTailLike && isGlobalLast) {
      trailing = tailProto.trailingWs;
      backslash = tailProto.hasBackslash && tailProto.content !== '' ? '\\' : '';
    } else if (isTailLike) {
      // Paragraph-end line: no backslash so the following newline is literal,
      // creating a blank-line paragraph separator in the TOML source.
      trailing = tailProto.trailingWs;
      backslash = '';
    } else {
      // Continuation line within a paragraph.
      trailing = newContent.length > 0 && /\s$/.test(newContent) ? '' : ' ';
      backslash = '\\';
    }
    rebuiltLines.push(`${indent}${newContent}${trailing}${backslash}`);

    // For literal line-break path, isParaEnd itself encodes the structural newline boundary
    // (no trailing backslash). No extra blank lines are inserted here.
    if (!isGlobalLast && !isParaEnd && !isLiteralLineBreakPath) {
      // Single-group path: insert original blank groups, but only when the packed content
      // contains no encoded newline escape sequences (those already represent paragraph
      // breaks inline, so blank-line placement from original positions would be misleading).
      const singleInput = newContentLines.join('');
      const hasEncodedNewlines = /(?<!\\)\\n/.test(singleInput);
      if (!hasEncodedNewlines && i < blankGroups.length && blankGroups[i].length > 0) {
        for (const blankLine of blankGroups[i]) rebuiltLines.push(blankLine);
      }
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
