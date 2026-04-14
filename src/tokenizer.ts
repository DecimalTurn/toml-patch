import { Location, Locator, findPosition } from './location';
import ParseError from './parse-error';

export enum TokenType {
  Bracket = 'Bracket',
  Curly = 'Curly',
  Equal = 'Equal',
  Comma = 'Comma',
  Dot = 'Dot',
  Comment = 'Comment',
  Literal = 'Literal'
}

export interface Token {
  type: TokenType;
  raw: string;
  loc: Location;
}

export const IS_WHITESPACE = /\s/;
export const IS_NEW_LINE = /(\r\n|\n)/;
export const IS_BARE_KEY = /^[\w-]+$/;
export const DOUBLE_QUOTE = `"`;
export const SINGLE_QUOTE = `'`;
export const SPACE = ' ';
export const ESCAPE = '\\';

const IS_VALID_LEADING_CHARACTER = /[\w,\d,",',+,\-,_]/;

// Character code constants for hot-path comparisons
const CH_TAB = 0x09;
const CH_LF = 0x0a;
const CH_CR = 0x0d;
const CH_SPACE = 0x20;
const CH_HASH = 0x23;
const CH_COMMA = 0x2c;
const CH_DOT = 0x2e;
const CH_EQUAL = 0x3d;
const CH_LBRACKET = 0x5b;
const CH_RBRACKET = 0x5d;
const CH_LBRACE = 0x7b;
const CH_RBRACE = 0x7d;
const CH_DEL = 0x7f;

export function* tokenize(input: string): IterableIterator<Token> {
  const len = input.length;
  let pos = 0;

  // Build line index incrementally as we scan, instead of a separate
  // upfront findLines pass. Records newline positions in the main loop
  // and inside multilineToken.
  const lines: number[] = [];
  const locate: Locator = (start: number, end: number) => ({
    start: findPosition(lines, start),
    end: findPosition(lines, end)
  });

  while (pos < len) {
    const code = input.charCodeAt(pos);

    // TOML does not allow ASCII control characters other than HT (TAB), LF, and CR.
    // CR is only allowed as part of CRLF and is validated below.
    if ((code <= 0x1f || code === CH_DEL) && code !== CH_TAB && code !== CH_CR && code !== CH_LF) {
      throw new ParseError(
        input,
        findPosition(lines, pos),
        `Control char 0x${code.toString(16).toUpperCase().padStart(2, '0')} not allowed`
      );
    }

    // CR (0x0D) is only allowed as part of CRLF
    if (code === CH_CR) {
      if (pos + 1 >= len || input.charCodeAt(pos + 1) !== CH_LF) {
        throw new ParseError(
          input,
          findPosition(lines, pos),
          'Standalone CR; must be CRLF or LF'
        );
      }
    }

    if (code === CH_SPACE || code === CH_TAB || code === CH_CR) {
      // skip non-newline whitespace (CR is part of CRLF; LF will be next)
    } else if (code === CH_LF) {
      // Record newline position for incremental line index
      lines.push(pos);
    } else if (code === CH_LBRACKET || code === CH_RBRACKET) {
      yield { type: TokenType.Bracket, raw: input[pos], loc: locate(pos, pos + 1) };
    } else if (code === CH_LBRACE || code === CH_RBRACE) {
      yield { type: TokenType.Curly, raw: input[pos], loc: locate(pos, pos + 1) };
    } else if (code === CH_EQUAL) {
      yield { type: TokenType.Equal, raw: '=', loc: locate(pos, pos + 1) };
    } else if (code === CH_COMMA) {
      yield { type: TokenType.Comma, raw: ',', loc: locate(pos, pos + 1) };
    } else if (code === CH_DOT) {
      yield { type: TokenType.Dot, raw: '.', loc: locate(pos, pos + 1) };
    } else if (code === CH_HASH) {
      yield comment();
    } else {
      const multiline_char =
        checkThree(input, pos, SINGLE_QUOTE) ||
        checkThree(input, pos, DOUBLE_QUOTE);

      if (multiline_char) {
        yield multilineToken(multiline_char);
      } else {
        yield stringToken();
      }
    }

    pos++;
  }

  // ── Helper closures (capture pos by reference) ──────────────────────

  function comment(): Token {
    const start = pos;

    // TOML comment ends at CR or LF.
    while (pos + 1 < len) {
      const nextCode = input.charCodeAt(pos + 1);
      if (nextCode === CH_LF || nextCode === CH_CR) break;
      pos++;

      const cc = input.charCodeAt(pos);
      // Disallow ASCII control characters in comments (except HT / TAB).
      if ((cc <= 0x1f || cc === CH_DEL) && cc !== CH_TAB) {
        throw new ParseError(
          input,
          findPosition(lines, pos),
          `Control char 0x${cc.toString(16).toUpperCase().padStart(2, '0')} not allowed`
        );
      }
    }

    // Early exit is ok for comment, no closing conditions
    return {
      type: TokenType.Comment,
      raw: input.slice(start, pos + 1),
      loc: locate(start, pos + 1)
    };
  }

  function multilineToken(multiline_char: string): Token {
    const start = pos;
    const quotes = multiline_char + multiline_char + multiline_char;

    // Skip over opening quotes
    pos += 3;

    // Multiline strings close on the first unescaped """ / '''.
    // A run of 4 or 5 quote characters at the end is allowed to include 1 or 2 quotes
    // immediately before the closing delimiter, but 6+ consecutive quotes is invalid.
    while (pos < len) {
      const found = checkThree(input, pos, multiline_char);
      if (found) {
        let runLength = 3;
        while (input[pos + runLength] === multiline_char) {
          runLength++;
        }

        if (runLength >= 6) {
          throw new ParseError(
            input,
            findPosition(lines, pos),
            `Invalid multiline string: ${runLength} consecutive ${multiline_char} characters`
          );
        }

        if (runLength === 3) {
          // pos at first closing quote, advance to last closing quote
          pos += 2;
          break;
        }

        // runLength is 4 or 5: keep the leading 1 or 2 quote chars as content,
        // and close on the last 3.
        pos += runLength - 3; // skip content quotes
        pos += 2;            // advance to last closing quote
        break;
      }

      const cc = input.charCodeAt(pos);

      if (cc === CH_CR) {
        if (pos + 1 >= len || input.charCodeAt(pos + 1) !== CH_LF) {
          throw new ParseError(
            input,
            findPosition(lines, pos),
            'Standalone CR in multiline string; must be CRLF or LF'
          );
        }
      }

      // Validate control characters in multiline strings
      // In multiline strings, control characters are not allowed except tab (0x09), LF (0x0A), and CR (0x0D as part of CRLF)
      // DEL (0x7F) is also not allowed
      if ((cc <= 0x1f || cc === CH_DEL) && cc !== CH_TAB && cc !== CH_LF && cc !== CH_CR) {
        const stringType = multiline_char === DOUBLE_QUOTE ? 'multiline basic strings' : 'multiline literal strings';
        const hexCode = `0x${cc.toString(16).toUpperCase().padStart(2, '0')}`;

        // Provide friendly names for common control characters
        let charName = '';
        if (cc === 0x00) {
          charName = 'Null';
        } else if (cc === CH_DEL) {
          charName = 'DEL';
        }

        const message = charName
          ? `${charName} (${hexCode}) not allowed in ${stringType}`
          : `Control char ${hexCode} not allowed in ${stringType}`;

        throw new ParseError(
          input,
          findPosition(lines, pos),
          message
        );
      }

      // Record newlines inside multiline strings for incremental line index
      if (cc === CH_LF) {
        lines.push(pos);
      }

      pos++;
    }

    if (pos >= len) {
      // Check if the issue might be caused by escape sequences preventing proper closure
      // For multiline basic strings ("""), check if there are backslashes near the end that might be escaping quotes
      if (multiline_char === DOUBLE_QUOTE) {
        // Count trailing backslashes before EOF
        let bsCount = 0;
        let bi = len - 1;
        while (bi >= 0 && input[bi] === '\\') { bsCount++; bi--; }
        const hasEscapedQuotes = bsCount > 0 && bsCount % 2 !== 0;

        if (hasEscapedQuotes) {
          throw new ParseError(
            input,
            findPosition(lines, pos),
            `Unterminated multiline ${quotes} (possible escape issue)`
          );
        }
      }

      throw new ParseError(
        input,
        findPosition(lines, pos),
        `Unterminated multiline ${quotes}`
      );
    }

    return {
      type: TokenType.Literal,
      raw: input.slice(start, pos + 1),
      loc: locate(start, pos + 1)
    };
  }

  function stringToken(): Token {
    // Remaining possibilities: keys, strings, literals, integer, float, boolean
    //
    // Special cases:
    // "..." -> quoted
    // '...' -> quoted
    // "...".'...' -> bare
    // 0000-00-00 00:00:00 -> bare
    //
    // See https://github.com/toml-lang/toml#offset-date-time
    //
    // | For the sake of readability, you may replace the T delimiter between date and time with a space (as permitted by RFC 3339 section 5.6).
    // | `odt4 = 1979-05-27 07:32:00Z`
    //
    // From RFC 3339:
    //
    // | NOTE: ISO 8601 defines date and time separated by "T".
    // | Applications using this syntax may choose, for the sake of
    // | readability, to specify a full-date and full-time separated by
    // | (say) a space character.

    const ch = input[pos];

    // First, check for invalid characters
    if (!IS_VALID_LEADING_CHARACTER.test(ch)) {
      throw new ParseError(
        input,
        findPosition(lines, pos),
        `Unexpected char "${ch}"`
      );
    }

    const start = pos;
    let double_quoted = ch === DOUBLE_QUOTE;
    let single_quoted = ch === SINGLE_QUOTE;

    while (pos < len) {
      // Peek at next character – if none, we're done
      if (pos + 1 >= len) break;

      const nextCode = input.charCodeAt(pos + 1);

      // isFinished: if not inside quotes and next char is a terminator, stop
      if (!(double_quoted || single_quoted)) {
        if (
          nextCode === CH_SPACE || nextCode === CH_TAB ||
          nextCode === CH_LF || nextCode === CH_CR ||
          nextCode === CH_COMMA || nextCode === CH_DOT ||
          nextCode === CH_RBRACKET || nextCode === CH_RBRACE ||
          nextCode === CH_EQUAL || nextCode === CH_HASH
        ) {
          break;
        }
      }

      // Advance to next character
      pos++;

      // Validate control characters in quoted strings
      if (double_quoted || single_quoted) {
        const cc = input.charCodeAt(pos);
        // In basic strings (double-quoted) and literal strings (single-quoted),
        // control characters are not allowed except tab (0x09)
        // DEL (0x7F) is also not allowed
        if ((cc <= 0x1f || cc === CH_DEL) && cc !== CH_TAB) {
          const stringType = double_quoted ? 'basic strings' : 'literal strings';
          const hexCode = `0x${cc.toString(16).toUpperCase().padStart(2, '0')}`;

          // Provide friendly names for common control characters
          let charName = '';
          if (cc === CH_LF) {
            charName = 'Newline';
          } else if (cc === CH_CR) {
            charName = 'Carriage return';
          } else if (cc === 0x00) {
            charName = 'Null';
          } else if (cc === CH_DEL) {
            charName = 'DEL';
          }

          const message = charName
            ? `${charName} (${hexCode}) not allowed in ${stringType}`
            : `Control char ${hexCode} not allowed in ${stringType}`;

          throw new ParseError(
            input,
            findPosition(lines, pos),
            message
          );
        }
      }

      const currentChar = input[pos];
      if (currentChar === DOUBLE_QUOTE) double_quoted = !double_quoted;
      if (currentChar === SINGLE_QUOTE && !double_quoted) single_quoted = !single_quoted;

      if (pos + 1 >= len) break;

      // If next character is escape and currently double-quoted,
      // check for escaped quote
      if (double_quoted && currentChar === ESCAPE) {
        const nextChar = input[pos + 1];
        if (nextChar === DOUBLE_QUOTE || nextChar === ESCAPE) {
          pos++; // skip escaped char
        }
      }
    }

    if (double_quoted || single_quoted) {
      throw new ParseError(
        input,
        findPosition(lines, start),
        `Expected close of string with ${double_quoted ? DOUBLE_QUOTE : SINGLE_QUOTE}`
      );
    }

    return {
      type: TokenType.Literal,
      raw: input.slice(start, pos + 1),
      loc: locate(start, pos + 1)
    };
  }
}

/**
 * Check if the current character and the next two characters are the same
 * and not escaped.
 *
 * @param input - The input string.
 * @param current - The current index in the input string.
 * @param check - The character to check for.
 * @returns ⚠️The character if found, otherwise false.
 */
function checkThree(input: string, current: number, check: string): false | string {
  if (!check) {
    return false;
  }

  const has3 =
    input[current] === check &&
    input[current + 1] === check &&
    input[current + 2] === check;

  if (!has3) {
    return false;
  }

  // Only check for escaping in basic strings (double quotes)
  // Literal strings (single quotes) don't support escape sequences
  if (check === SINGLE_QUOTE) {
    return check; // No escaping in literal strings
  }

  // Check if the sequence is escaped by counting preceding backslashes
  let bsCount = 0;
  let i = current - 1;
  while (i >= 0 && input[i] === '\\') {
    bsCount++;
    i--;
  }

  if (bsCount === 0) {
    return check; // No backslashes means not escaped
  }

  const isEscaped = bsCount % 2 !== 0; // Odd number of backslashes means escaped

  return isEscaped ? false : check; // Return `check` if not escaped, otherwise `false`
}
