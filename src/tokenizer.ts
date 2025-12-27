import Cursor, { iterator } from './cursor';
import { Location, Locator, createLocate, findPosition } from './location';
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
export const DOUBLE_QUOTE = `"`;
export const SINGLE_QUOTE = `'`;
export const SPACE = ' ';
export const ESCAPE = '\\';

const IS_VALID_LEADING_CHARACTER = /[\w,\d,\",\',\+,\-,\_]/;
const IS_VALID_BARE_KEY_CHARACTER = /[A-Za-z0-9_-]/;

// Control character validation
// TOML disallows control characters (0x00-0x1F, 0x7F) except tab (0x09) in comments and strings
function isControlCharacter(char: string): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  // Control characters: 0x00-0x08, 0x0A-0x1F (excluding tab 0x09), and 0x7F (DEL)
  return (code >= 0x00 && code <= 0x08) || (code >= 0x0A && code <= 0x1F) || code === 0x7F;
}

// Check if character is a valid character (not control except tab)
function isInvalidInComment(char: string): boolean {
  return isControlCharacter(char);
}

// For basic strings, control characters except tab are not allowed
function isInvalidInString(char: string): boolean {
  return isControlCharacter(char);
}

export function* tokenize(input: string): IterableIterator<Token> {
  const cursor = new Cursor(iterator(input));
  cursor.next();

  const locate = createLocate(input);

  while (!cursor.done) {
    // Check for control characters at the top level (not in strings/comments)
    // VT (0x0B) and FF (0x0C) are not allowed anywhere in TOML
    const charCode = cursor.value!.charCodeAt(0);
    if (charCode === 0x0B || charCode === 0x0C) {
      throw new Error(
        `Control character 0x${charCode.toString(16).toUpperCase().padStart(2, '0')} is not allowed in TOML`
      );
    }
    
    if (IS_WHITESPACE.test(cursor.value!)) {
      // (skip whitespace)
    } else if (cursor.value === '[' || cursor.value === ']') {
      // Handle special characters: [, ], {, }, =, comma
      yield specialCharacter(cursor, locate, TokenType.Bracket);
    } else if (cursor.value === '{' || cursor.value === '}') {
      yield specialCharacter(cursor, locate, TokenType.Curly);
    } else if (cursor.value === '=') {
      yield specialCharacter(cursor, locate, TokenType.Equal);
    } else if (cursor.value === ',') {
      yield specialCharacter(cursor, locate, TokenType.Comma);
    } else if (cursor.value === '.') {
      yield specialCharacter(cursor, locate, TokenType.Dot);
    } else if (cursor.value === '#') {
      // Handle comments = # -> EOL
      yield comment(cursor, locate, input);
    } else {
      const multiline_char =
        checkThree(input, cursor.index, SINGLE_QUOTE) ||
        checkThree(input, cursor.index, DOUBLE_QUOTE);

      if (multiline_char) {
        // Multi-line literals or strings = no escaping
        yield multiline(cursor, locate, multiline_char, input);
      } else {
        yield string(cursor, locate, input);
      }
    }

    cursor.next();
  }
}

function specialCharacter(cursor: Cursor<string>, locate: Locator, type: TokenType): Token {
  return { type, raw: cursor.value!, loc: locate(cursor.index, cursor.index + 1) };
}

function comment(cursor: Cursor<string>, locate: Locator, input: string): Token {
  const start = cursor.index;
  let raw = cursor.value!;
  while (!cursor.peek().done && !IS_NEW_LINE.test(cursor.peek().value!)) {
    cursor.next();
    // Validate control characters in comments
    if (isInvalidInComment(cursor.value!)) {
      throw new ParseError(
        input,
        findPosition(input, cursor.index),
        `Invalid control character in comment (code: 0x${cursor.value!.charCodeAt(0).toString(16).toUpperCase()})`
      );
    }
    raw += cursor.value!;
  }

  // Early exit is ok for comment, no closing conditions

  return {
    type: TokenType.Comment,
    raw,
    loc: locate(start, cursor.index + 1)
  };
}

function multiline(
  cursor: Cursor<string>,
  locate: Locator,
  multiline_char: string,
  input: string
): Token {
  const start = cursor.index;
  let quotes = multiline_char + multiline_char + multiline_char;
  let raw = quotes;

  // Skip over quotes
  cursor.next();
  cursor.next();
  cursor.next();

  // The reason why we need to check if there is more than three is because we have to match the last 3 quotes, not the first 3 that appears consecutively
  // See spec-string-basic-multiline-9.toml
  while (!cursor.done && (!checkThree(input, cursor.index, multiline_char) || CheckMoreThanThree(input, cursor.index, multiline_char))) {
    // Validate control characters in multiline strings
    // For multiline strings, we allow tab (0x09), LF (0x0A), and CR only if followed by LF (CRLF)
    if (!cursor.value) break;
    const code = cursor.value.charCodeAt(0);
    const isTab = code === 0x09;
    const isLF = code === 0x0A;
    const isCR = code === 0x0D;
    
    // CR is only allowed if followed by LF (CRLF sequence)
    if (isCR) {
      const nextChar = input[cursor.index + 1];
      const nextIsCR = nextChar && nextChar.charCodeAt(0) === 0x0A;
      if (!nextIsCR) {
        throw new ParseError(
          input,
          findPosition(input, cursor.index),
          `Invalid standalone CR (\\r) in multiline string (must be part of CRLF sequence)`
        );
      }
    }
    
    if (isControlCharacter(cursor.value) && !isTab && !isLF && !isCR) {
      throw new ParseError(
        input,
        findPosition(input, cursor.index),
        `Invalid control character in multiline string (code: 0x${code.toString(16).toUpperCase()})`
      );
    }
    raw += cursor.value;
    cursor.next();
  }

  if (cursor.done) {
    throw new ParseError(
      input,
      findPosition(input, cursor.index),
      `Expected close of multiline string with ${quotes}, reached end of file`
    );
  }

  raw += quotes;

  cursor.next();
  cursor.next();

  return {
    type: TokenType.Literal,
    raw,
    loc: locate(start, cursor.index + 1)
  };
}

function string(cursor: Cursor<string>, locate: Locator, input: string): Token {
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

  // First, check for invalid characters
  if (!IS_VALID_LEADING_CHARACTER.test(cursor.value!)) {
    throw new ParseError(
      input,
      findPosition(input, cursor.index),
      `Unsupported character "${cursor.value}". Expected ALPHANUMERIC, ", ', +, -, or _`
    );
  }

  const start = cursor.index;
  let raw = cursor.value!;
  let double_quoted = cursor.value === DOUBLE_QUOTE;
  let single_quoted = cursor.value === SINGLE_QUOTE;

  const isFinished = (cursor: Cursor<string>) => {
    if (cursor.peek().done) return true;
    const next_item = cursor.peek().value!;

    return (
      !(double_quoted || single_quoted) &&
      (IS_WHITESPACE.test(next_item) ||
        next_item === ',' ||
        next_item === '.' ||
        next_item === ']' ||
        next_item === '}' ||
        next_item === '=' ||
        next_item === '#'
      )
    );
  };

  while (!cursor.done && !isFinished(cursor)) {
    cursor.next();

    // Validate newlines are not allowed in single-line strings (keys)
    if ((double_quoted || single_quoted) && cursor.value === '\n') {
      throw new ParseError(
        input,
        findPosition(input, cursor.index),
        'Newlines are not allowed in keys or single-line strings'
      );
    }

    // Validate control characters in quoted strings (before toggling the quote state)
    if ((double_quoted || single_quoted) && cursor.value !== DOUBLE_QUOTE && cursor.value !== SINGLE_QUOTE) {
      // For single-quoted (literal) strings, we also need to check for control characters
      if (cursor.value && isInvalidInString(cursor.value)) {
        throw new ParseError(
          input,
          findPosition(input, cursor.index),
          `Invalid control character in string (code: 0x${cursor.value.charCodeAt(0).toString(16).toUpperCase()})`
        );
      }
    }

    // Validate bare key characters (when not in quotes)
    if (!double_quoted && !single_quoted && cursor.value) {
      // Check if this is a bare key character (not a value)
      // Bare keys can only contain A-Z, a-z, 0-9, _, -
      if (!IS_VALID_BARE_KEY_CHARACTER.test(cursor.value)) {
        // Check if it's a valid terminator or special character
        const isTerminator = 
          IS_WHITESPACE.test(cursor.value) ||
          cursor.value === ',' ||
          cursor.value === '.' ||
          cursor.value === ']' ||
          cursor.value === '}' ||
          cursor.value === '=' ||
          cursor.value === '#' ||
          cursor.value === '+' ||  // Allow + for numbers
          cursor.value === 'e' ||  // Allow e for exponents
          cursor.value === 'E' ||  // Allow E for exponents
          cursor.value === 'x' ||  // Allow x for hex
          cursor.value === 'o' ||  // Allow o for octal
          cursor.value === 'b' ||  // Allow b for binary
          cursor.value === ':' ||  // Allow : for datetimes
          cursor.value === 'T' ||  // Allow T for datetimes
          cursor.value === 'Z' ||  // Allow Z for timezone
          /[0-9]/.test(cursor.value); // Allow digits
        
        // If it's not a terminator and we're at the start or early in the token,
        // it might be an invalid bare key character
        // However, we need to be careful not to reject valid number/datetime formats
        // Only reject truly invalid characters in what looks like a bare key context
        if (!isTerminator && raw.length <= 20 && !/[0-9\+\-\.]/.test(raw)) {
          throw new ParseError(
            input,
            findPosition(input, cursor.index),
            `Invalid character '${cursor.value}' in bare key. Bare keys can only contain A-Z, a-z, 0-9, _, and -`
          );
        }
      }
    }

    if (cursor.value === DOUBLE_QUOTE) double_quoted = !double_quoted;
    if (cursor.value === SINGLE_QUOTE && !double_quoted) single_quoted = !single_quoted;

    raw += cursor.value!;

    if (cursor.peek().done) break;
    let next_item = cursor.peek().value!;

    // If next character is escape and currently double-quoted,
    // check for escaped quote
    if (double_quoted && cursor.value === ESCAPE) {
      if (next_item === DOUBLE_QUOTE) {
        raw += DOUBLE_QUOTE;
        cursor.next();
      } else if (next_item === ESCAPE) {
        raw += ESCAPE;
        cursor.next();
      }
    }
  }

  if (double_quoted || single_quoted) {
    throw new ParseError(
      input,
      findPosition(input, start),
      `Expected close of string with ${double_quoted ? DOUBLE_QUOTE : SINGLE_QUOTE}`
    );
  }

  return {
    type: TokenType.Literal,
    raw,
    loc: locate(start, cursor.index + 1)
  };
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

  // Check if the sequence is escaped
  const precedingText = input.slice(0, current); // Get the text before the current position
  const backslashes  = precedingText.match(/\\+$/); // Match trailing backslashes

  if (!backslashes) {
    return check; // No backslashes means not escaped
  }
 
  const isEscaped = backslashes[0].length % 2 !== 0; // Odd number of backslashes means escaped

  return isEscaped ? false : check; // Return `check` if not escaped, otherwise `false`
}

export function CheckMoreThanThree(input: string, current: number, check: string): boolean {
  
  if (!check) {
    return false;
  }

  return (
    input[current] === check &&
    input[current + 1] === check &&
    input[current + 2] === check &&
    input[current + 3] === check
  )

}
