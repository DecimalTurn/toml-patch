import { SINGLE_QUOTE, DOUBLE_QUOTE } from './tokenizer';

const TRIPLE_DOUBLE_QUOTE = `"""`;
const TRIPLE_SINGLE_QUOTE = `'''`;

// Hex digit lookup (returns -1 for non-hex chars)
const HEX_VAL = new Int8Array(128);
HEX_VAL.fill(-1);
for (let i = 0; i < 10; i++) HEX_VAL[0x30 + i] = i;       // '0'-'9'
for (let i = 0; i < 6; i++) { HEX_VAL[0x41 + i] = 10 + i; HEX_VAL[0x61 + i] = 10 + i; } // A-F, a-f

function isHex(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c < 128 && HEX_VAL[c] !== -1;
}

function hexVal4(s: string, i: number): number {
  return (HEX_VAL[s.charCodeAt(i)] << 12) |
         (HEX_VAL[s.charCodeAt(i + 1)] << 8) |
         (HEX_VAL[s.charCodeAt(i + 2)] << 4) |
          HEX_VAL[s.charCodeAt(i + 3)];
}

export function parseString(raw: string): string {
  if (raw.startsWith(TRIPLE_SINGLE_QUOTE)) {
    return trimLeadingNewline(raw.slice(3, raw.length - 3));
  } else if (raw.startsWith(SINGLE_QUOTE)) {
    return raw.slice(1, raw.length - 1);
  } else if (raw.startsWith(TRIPLE_DOUBLE_QUOTE)) {
    return unescapeBasicString(trimLeadingNewline(raw.slice(3, raw.length - 3)), true);
  } else if (raw.startsWith(DOUBLE_QUOTE)) {
    return unescapeBasicString(raw.slice(1, raw.length - 1), false);
  } else {
    return raw;
  }
}

/**
 * Single-pass unescape for TOML basic strings (double-quoted).
 * Handles all escape sequences including \uXXXX, \UXXXXXXXX, \xHH, \e,
 * and the standard JSON-compatible escapes (\b, \t, \n, \f, \r, \\, \").
 * For multiline strings, also handles line-ending backslashes and literal newlines.
 */
function unescapeBasicString(value: string, multiline: boolean): string {
  const len = value.length;
  // Fast path: no backslash means no escapes to process
  // For non-multiline this is sufficient; for multiline we still need it
  // because literal newlines are valid content
  if (!multiline && value.indexOf('\\') === -1) {
    return value;
  }

  const parts: string[] = [];
  let start = 0; // start of current unescaped run

  for (let i = 0; i < len; i++) {
    const ch = value[i];

    if (ch !== '\\') continue;

    // Flush the unescaped run before this backslash
    if (i > start) parts.push(value.slice(start, i));

    i++; // advance past backslash
    if (i >= len) throw new Error('Invalid escape sequence: trailing backslash');

    const esc = value[i];
    switch (esc) {
      case 'b':  parts.push('\b'); break;
      case 't':  parts.push('\t'); break;
      case 'n':  parts.push('\n'); break;
      case 'f':  parts.push('\f'); break;
      case 'r':  parts.push('\r'); break;
      case '"':  parts.push('"');  break;
      case '\\': parts.push('\\'); break;
      case 'e':  parts.push('\u001b'); break; // TOML 1.1.0 ESC

      case 'u': {
        // \uXXXX — 4 hex digits
        if (i + 4 > len || !isHex(value[i+1]) || !isHex(value[i+2]) || !isHex(value[i+3]) || !isHex(value[i+4])) {
          throw new Error(`Invalid Unicode escape: \\u${value.slice(i + 1, i + 5)}`);
        }
        const cp = hexVal4(value, i + 1);
        if (cp >= 0xD800 && cp <= 0xDFFF) {
          throw new Error(`Invalid Unicode escape: \\u${value.slice(i + 1, i + 5)} (surrogate codepoints are not allowed)`);
        }
        parts.push(String.fromCharCode(cp));
        i += 4;
        break;
      }

      case 'U': {
        // \UXXXXXXXX — 8 hex digits
        if (i + 8 > len) {
          throw new Error(`Invalid Unicode escape: \\U${value.slice(i + 1, i + 9)}`);
        }
        for (let j = 1; j <= 8; j++) {
          if (!isHex(value[i + j])) {
            throw new Error(`Invalid Unicode escape: \\U${value.slice(i + 1, i + 9)}`);
          }
        }
        const cp = parseInt(value.slice(i + 1, i + 9), 16);
        parts.push(String.fromCodePoint(cp));
        i += 8;
        break;
      }

      case 'x': {
        // \xHH — 2 hex digits (TOML 1.1.0)
        if (i + 2 > len || !isHex(value[i+1]) || !isHex(value[i+2])) {
          throw new Error(`Invalid hex escape: \\x${value.slice(i + 1, i + 3)}`);
        }
        const cp = (HEX_VAL[value.charCodeAt(i + 1)] << 4) | HEX_VAL[value.charCodeAt(i + 2)];
        parts.push(String.fromCharCode(cp));
        i += 2;
        break;
      }

      default:
        // Multiline: line-ending backslash — skip backslash + whitespace + newline + whitespace
        // A line-ending backslash is only valid if there is at least one newline
        // in the whitespace that follows the backslash.
        if (multiline && (esc === '\n' || esc === '\r' || esc === ' ' || esc === '\t')) {
          // Scan forward through whitespace; must find at least one newline
          let hasNewline = esc === '\n' || esc === '\r';
          let j = i;
          while (j < len && (value[j] === ' ' || value[j] === '\t' || value[j] === '\n' || value[j] === '\r')) {
            if (value[j] === '\n' || value[j] === '\r') hasNewline = true;
            j++;
          }
          if (!hasNewline) {
            // No newline found — not a valid line-ending backslash
            throw new Error(`Invalid escape sequence: \\${esc}`);
          }
          i = j - 1; // will be incremented by the for loop
          break;
        }
        throw new Error(`Invalid escape sequence: \\${esc}`);
    }

    start = i + 1;
  }

  // Flush any remaining unescaped content
  if (start === 0) return value; // no escapes were found
  if (start < len) parts.push(value.slice(start));

  return parts.join('');
}

/**
 * @deprecated Kept for backward compatibility with external callers.
 * The multiline pipeline now uses unescapeBasicString directly.
 */
export function escapeDoubleQuotes(value: string): string {
  let result = '';
  let precedingBackslashes = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (char === '"' && precedingBackslashes % 2 === 0) {
      result += '\\"';
    } else {
      result += char;
    }

    if (char === '\\') {
      precedingBackslashes++;
    } else {
      precedingBackslashes = 0;
    }
  }

  return result;
}

/**
 * @deprecated Kept for backward compatibility. Use unescapeBasicString instead.
 */
export function unescapeLargeUnicode(escaped: string): string {
  return unescapeBasicString(escaped, false);
}

export function escape(value: string): string {
  const s = JSON.stringify(value);
  return s.slice(1, s.length - 1);
}

function trimLeadingNewline(value: string): string {
  if (value.charCodeAt(0) === 0x0a) return value.slice(1);           // \n
  if (value.charCodeAt(0) === 0x0d && value.charCodeAt(1) === 0x0a)  // \r\n
    return value.slice(2);
  return value;
}
