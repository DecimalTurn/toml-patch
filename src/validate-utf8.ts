/**
 * Validates that the given byte array is well-formed UTF-8.
 *
 * Performs a single-pass scan checking:
 *   - No unexpected continuation bytes (0x80–0xBF outside a sequence)
 *   - No overlong sequences (0xC0–0xC1 lead bytes)
 *   - Truncated sequences (lead byte not followed by enough continuation bytes)
 *   - Invalid continuation bytes within a sequence
 *   - Surrogate code points (U+D800–U+DFFF, encoded as 0xED 0xA0–0xBF ...)
 *   - Code points above U+10FFFF
 *   - Invalid bytes 0xF5–0xFF
 *
 * @throws {Error} if the input contains an invalid UTF-8 sequence
 */
export function validateUtf8(bytes: Uint8Array): void {
  const len = bytes.length;
  let i = 0;

  while (i < len) {
    const b0 = bytes[i];

    if (b0 < 0x80) {
      // Single-byte ASCII (0x00–0x7F)
      i++;
      continue;
    }

    if (b0 < 0xC0) {
      // 0x80–0xBF: unexpected continuation byte
      throw new Error(
        `Invalid UTF-8: unexpected continuation byte 0x${b0.toString(16).toUpperCase().padStart(2, '0')} at byte offset ${i}`
      );
    }

    if (b0 < 0xC2) {
      // 0xC0–0xC1: overlong 2-byte sequence (would encode U+0000–U+007F)
      throw new Error(
        `Invalid UTF-8: overlong sequence at byte offset ${i}`
      );
    }

    let seqLen: number;
    let codePoint: number;

    if (b0 < 0xE0) {
      // 0xC2–0xDF: 2-byte sequence
      seqLen = 2;
      codePoint = b0 & 0x1F;
    } else if (b0 < 0xF0) {
      // 0xE0–0xEF: 3-byte sequence
      seqLen = 3;
      codePoint = b0 & 0x0F;
    } else if (b0 < 0xF5) {
      // 0xF0–0xF4: 4-byte sequence
      seqLen = 4;
      codePoint = b0 & 0x07;
    } else {
      // 0xF5–0xFF: always invalid
      throw new Error(
        `Invalid UTF-8: invalid byte 0x${b0.toString(16).toUpperCase().padStart(2, '0')} at byte offset ${i}`
      );
    }

    if (i + seqLen > len) {
      throw new Error(
        `Invalid UTF-8: truncated multi-byte sequence at byte offset ${i}`
      );
    }

    // Validate continuation bytes and accumulate the code point
    for (let j = 1; j < seqLen; j++) {
      const cont = bytes[i + j];
      if ((cont & 0xC0) !== 0x80) {
        throw new Error(
          `Invalid UTF-8: expected continuation byte at offset ${i + j}, got 0x${cont.toString(16).toUpperCase().padStart(2, '0')}`
        );
      }
      codePoint = (codePoint << 6) | (cont & 0x3F);
    }

    // Overlong encodings: the decoded code point must require exactly seqLen bytes
    const minCodePoint = seqLen === 2 ? 0x80 : seqLen === 3 ? 0x800 : 0x10000;
    if (codePoint < minCodePoint) {
      throw new Error(
        `Invalid UTF-8: overlong encoding for U+${codePoint.toString(16).toUpperCase().padStart(4, '0')} at byte offset ${i}`
      );
    }

    // Surrogates (U+D800–U+DFFF) are not valid Unicode scalar values
    if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
      throw new Error(
        `Invalid UTF-8: surrogate code point U+${codePoint.toString(16).toUpperCase().padStart(4, '0')} at byte offset ${i}`
      );
    }

    // Above U+10FFFF
    if (codePoint > 0x10FFFF) {
      throw new Error(
        `Invalid UTF-8: code point U+${codePoint.toString(16).toUpperCase().padStart(5, '0')} exceeds Unicode maximum at byte offset ${i}`
      );
    }

    i += seqLen;
  }
}
