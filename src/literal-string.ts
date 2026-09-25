/**
 * @file Checks for whether a value can be written into a TOML literal string.
 * @module literal-string
 *
 * Literal strings do not process escape sequences, so a value can only be
 * written into one verbatim: it must not contain the string type's delimiter,
 * and it must not contain a character TOML forbids in that string type.
 *
 * Both the full string generator and the lite value encoder gate their literal
 * output on these checks, so a value that cannot be literal falls back the same
 * way in both. Without them, `generateLiteralString` writes the value straight
 * between the quotes and produces TOML that the parser rejects.
 */

/**
 * True when `value` can be written verbatim inside a single-line literal
 * string: no apostrophe, no newline, and no control character other than tab.
 */
export function canUseLiteralString(value: string): boolean {
  if (value.includes("'")) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) return false;
  }
  return true;
}

/**
 * True when `value` can be written verbatim inside a multiline literal string:
 * no `'''`, no control characters other than tab, and no standalone carriage
 * return (newlines must be LF or CRLF).
 */
export function canUseMultilineLiteral(value: string): boolean {
  if (value.includes("'''")) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x0d) {
      if (value.charCodeAt(i + 1) !== 0x0a) return false;
    } else if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f) {
      return false;
    }
  }
  return true;
}
