import { SINGLE_QUOTE, DOUBLE_QUOTE } from './tokenizer';
import { pipe } from './utils';

const TRIPLE_DOUBLE_QUOTE = `"""`;
const TRIPLE_SINGLE_QUOTE = `'''`;
const LF = '\\n';
const CRLF = '\\r\\n';
const IS_CRLF = /\r\n/g;
const IS_LF = /\n/g;
const IS_LEADING_NEW_LINE = /^(\r\n|\n)/;
// This regex is used to match an odd number of backslashes followed by a line ending
// It uses a negative lookbehind to ensure that the backslash is not preceded by another backslash.
// We need an odd number of backslashes so that the last one is not escaped.
const IS_LINE_ENDING_BACKSLASH = /(?<!\\)(?:\\\\)*(\\\s*[\n\r\n]\s*)/g;

export function parseString(raw: string): string {
  if (raw.startsWith(TRIPLE_SINGLE_QUOTE)) {
    return pipe(
      trim(raw, 3),
      trimLeadingWhitespace
    );
  } else if (raw.startsWith(SINGLE_QUOTE)) {
    return trim(raw, 1);
  } else if (raw.startsWith(TRIPLE_DOUBLE_QUOTE)) {
    return pipe(
      trim(raw, 3),
      trimLeadingWhitespace,
      lineEndingBackslash,
      escapeNewLines,
      escapeDoubleQuotes,
      unescapeLargeUnicode
    );
  } else if (raw.startsWith(DOUBLE_QUOTE)) {
    return pipe(
      trim(raw, 1),
      unescapeLargeUnicode
    );
  } else {
    return raw;
  }
}

export function escapeDoubleQuotes(value: string): string {
  let result = '';
  let precedingBackslashes = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (char === '"' && precedingBackslashes % 2 === 0) {
      // If the current character is a quote and it is not escaped, escape it
      result += '\\"';
    } else {
      // Otherwise, add the character as is
      result += char;
    }

    // Update the count of consecutive backslashes
    if (char === '\\') {
      precedingBackslashes++;
    } else {
      precedingBackslashes = 0; // Reset if the character is not a backslash
    }
  }

  return result;
}

export function unescapeLargeUnicode(escaped: string): string {
  // JSON.parse handles everything except \UXXXXXXXX
  // replace those instances with code point, escape that, and then parse
  const LARGE_UNICODE = /\\U[a-fA-F0-9]{8}/g;
  const json_escaped = escaped.replace(LARGE_UNICODE, value => {
    const code_point = parseInt(value.replace('\\U', ''), 16);
    const as_string = String.fromCodePoint(code_point);

    return trim(JSON.stringify(as_string), 1);
  });

  const fixed_json_escaped = escapeTabsForJSON(json_escaped);

  // Parse the properly escaped JSON string
  const parsed = JSON.parse(`"${fixed_json_escaped}"`);
  return parsed;
}

function escapeTabsForJSON(value: string): string {
  return value
    .replace(/\t/g, '\\t')
}

export function escape(value: string): string {
  return trim(JSON.stringify(value), 1);
}

function trim(value: string, count: number): string {
  return value.slice(count, value.length - count);
}

function trimLeadingWhitespace(value: string): string {
  return value.replace(IS_LEADING_NEW_LINE, '');
}

function escapeNewLines(value: string): string {
  return value.replace(IS_CRLF, CRLF).replace(IS_LF, LF);
}

function lineEndingBackslash(value: string): string {
  return value.replace(IS_LINE_ENDING_BACKSLASH, (match, group) => match.replace(group, ''));
}
