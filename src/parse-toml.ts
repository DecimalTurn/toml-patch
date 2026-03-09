import {
  NodeType,
  KeyValue,
  Table,
  TableKey,
  TableArray,
  TableArrayKey,
  Key,
  Value,
  String,
  Integer,
  Float,
  Boolean,
  DateTime,
  InlineTable,
  InlineArray,
  InlineItem,
  Comment,
  AST,
  Block
} from './ast';
import { Token, TokenType, tokenize, DOUBLE_QUOTE, SINGLE_QUOTE } from './tokenizer';
import { parseString } from './parse-string';
import Cursor from './cursor';
import { clonePosition, cloneLocation } from './location';
import ParseError from './parse-error';

import {
  DateFormatHelper,
  LocalDate,
  LocalTime,
  LocalDateTime,
  OffsetDateTime
} from './date-format';

// Create a shorter alias for convenience
const dateFormatHelper = DateFormatHelper;

const TRUE = 'true';
const FALSE = 'false';
const HAS_E = /e/i;
const IS_DIVIDER = /\_/g;
const IS_INF = /^[+\-]?inf$/;
const IS_NAN = /^[+\-]?nan$/;
const IS_HEX = /^[+\-]?0x/i;

/**
 * Check if a character code is a valid bare key character (A-Za-z0-9_-).
 * Uses charCode range checks instead of regex for speed.
 */
function isBareKeyCode(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) || // a-z
    (code >= 0x30 && code <= 0x39) || // 0-9
    code === 0x5f ||                   // _
    code === 0x2d                      // -
  );
}
const IS_OCTAL = /^[+\-]?0o/i;
const IS_BINARY = /^[+\-]?0b/i;

// ---------------------------------------------------------------------------
// Shared validation helpers (extracted to reduce duplication)
// ---------------------------------------------------------------------------

/** Validate bare key characters (A-Za-z0-9_- only). Throws ParseError on invalid char. */
function validateBareKeyChars(
  raw: string, input: string, startLoc: { line: number; column: number }
): void {
  for (let i = 0; i < raw.length; i++) {
    if (!isBareKeyCode(raw.charCodeAt(i))) {
      throw new ParseError(
        input,
        { line: startLoc.line, column: startLoc.column + i },
        `Invalid bare key char '${raw[i]}'`
      );
    }
  }
}

/** Reject multiline strings used as keys. */
function rejectMultilineKey(
  raw: string, input: string, loc: { line: number; column: number }
): void {
  if (raw.startsWith('"""') || raw.startsWith("'''")) {
    throw new ParseError(
      input, loc,
      'Multiline strings cannot be keys'
    );
  }
}

/** Parse a string key, wrapping parse errors as ParseErrors. */
function parseKeyString(raw: string, input: string, loc: { line: number; column: number }): string {
  try {
    return parseString(raw);
  } catch (err) {
    throw new ParseError(input, loc, (err as Error).message);
  }
}

/** Validate underscore placement in a numeric token. */
function validateUnderscores(
  str: string, input: string, loc: any, signed = true
): void {
  if (/_$/.test(str)) {
    throw new ParseError(input, loc, 'Underscore must be between digits');
  }
  if (signed ? /^[+\-]?_/.test(str) : /^_/.test(str)) {
    throw new ParseError(input, loc, 'Underscore must be between digits');
  }
  if (/__/.test(str)) {
    throw new ParseError(input, loc, 'Consecutive underscores not allowed');
  }
}

/** Validate no leading zeros in a numeric token (skips hex/octal/binary). */
function validateLeadingZeros(
  raw: string, input: string, loc: any, label: string
): void {
  const withoutUnderscores = raw.replace(IS_DIVIDER, '');
  if (
    /^[+\-]?0\d/.test(withoutUnderscores) &&
    !IS_HEX.test(raw) && !IS_OCTAL.test(raw) && !IS_BINARY.test(raw)
  ) {
    throw new ParseError(input, loc, `Leading zeros are not allowed in ${label}`);
  }
}

/** Validate exponent syntax in a float token. */
function validateExponent(
  str: string, fullRaw: string, input: string, loc: any
): void {
  if (/_[eE]/.test(str)) {
    throw new ParseError(input, loc, 'Underscore before exponent is not allowed');
  }
  if (/[eE][+\-]?_/.test(str)) {
    throw new ParseError(input, loc, 'Underscore at start of exponent is not allowed');
  }
  if (/[eE][+\-]?$/.test(str)) {
    throw new ParseError(input, loc, `Invalid float "${fullRaw}": incomplete exponent`);
  }
  if (/[eE][+\-]?.*\./.test(str)) {
    throw new ParseError(input, loc, `Invalid float "${fullRaw}": decimal point not allowed in exponent`);
  }
}

/** Validate time-component digit counts (must be exactly 2 each). */
function validateTimeDigits(
  hour: string, minute: string, second: string | undefined,
  raw: string, input: string, loc: any
): void {
  if (hour.length !== 2) {
    throw new ParseError(input, loc, `"${raw}": hour must be 2 digits`);
  }
  if (minute.length !== 2) {
    throw new ParseError(input, loc, `"${raw}": minute must be 2 digits`);
  }
  if (second && second.length !== 2) {
    throw new ParseError(input, loc, `"${raw}": second must be 2 digits`);
  }
}

/** Validate time-component value ranges. */
function validateTimeRange(
  hour: string | undefined, minute: string | undefined, second: string | undefined,
  raw: string, input: string, loc: any
): void {
  if (hour !== undefined) {
    const h = parseInt(hour, 10);
    if (h < 0 || h > 23) {
      throw new ParseError(input, loc, `"${raw}": hour must be 00-23`);
    }
  }
  if (minute !== undefined) {
    const m = parseInt(minute, 10);
    if (m < 0 || m > 59) {
      throw new ParseError(input, loc, `"${raw}": minute must be 00-59`);
    }
  }
  if (second !== undefined) {
    const s = parseInt(second, 10);
    if (s < 0 || s > 60) {
      throw new ParseError(input, loc, `"${raw}": second must be 00-60`);
    }
  }
}

/**
 * Validate a prefixed integer (hex, octal, or binary).
 * @param prefix - lowercase prefix like "0x", "0o", "0b"
 * @param validDigits - regex matching valid digit characters (e.g. /^[0-9a-fA-F]+$/)
 * @param name - display name like "Hexadecimal", "Octal", "Binary"
 */
function validatePrefixedInt(
  raw: string, input: string, loc: any,
  prefix: string, validDigits: RegExp, name: string, invalidMsg?: string
): void {
  const upper = prefix[0] + prefix[1].toUpperCase();
  const capsRe = new RegExp('^[+\\-]?' + upper.replace(/([\[\]])/g, '\\$1'));
  if (capsRe.test(raw)) {
    throw new ParseError(input, loc, `${name} prefix must be lowercase "${prefix}"`);
  }
  const underRe = new RegExp('^[+\\-]?' + prefix + '_', 'i');
  if (underRe.test(raw)) {
    throw new ParseError(input, loc, 'Underscore must be between digits');
  }
  const stripRe = new RegExp('^[+\\-]?' + prefix, 'i');
  const numericPart = raw.replace(stripRe, '');
  if (!numericPart || numericPart === '_' || /^_/.test(numericPart)) {
    throw new ParseError(input, loc, `Incomplete ${name.toLowerCase()} number`);
  }
  const digits = numericPart.replace(/_/g, '');
  if (!validDigits.test(digits)) {
    throw new ParseError(input, loc, invalidMsg ?? `Invalid ${name.toLowerCase()} digits`);
  }
  if (/^[+\-]/.test(raw)) {
    throw new ParseError(input, loc, `${name} numbers cannot have a sign prefix`);
  }
}

// ---------------------------------------------------------------------------

// Export the date classes for external use
export {
  LocalDate,
  LocalTime,
  LocalDateTime,
  OffsetDateTime,
  DateFormatHelper
} from './date-format';

export default function* parseTOML(input: string): AST {
  // Use non-generator parsing to avoid stack overflow on deeply nested structures
  const cursor = new Cursor(tokenize(input));
  
  while (!cursor.next().done) {
    const blocks = walkBlock(cursor, input);
    for (const block of blocks) {
      yield block;
    }
  }
}

/**
 * Continues parsing TOML from a remaining string and appends the results to an existing AST.
 * 
 * @param existingAst - The existing AST to append to
 * @param remainingString - The remaining TOML string to parse
 * @returns A new complete AST with both the existing and newly parsed items
 */
export function* continueParsingTOML(existingAst: AST, remainingString: string): AST {
  // Yield all items from the existing AST
  for (const item of existingAst) {
    yield item;
  }
  
  // Parse and yield all items from the remaining string using non-generator path
  const cursor = new Cursor(tokenize(remainingString));
  
  while (!cursor.next().done) {
    const blocks = walkBlock(cursor, remainingString);
    for (const block of blocks) {
      yield block;
    }
  }
}

function comment(cursor: Cursor<Token>): Comment {
  // # line comment
  // ^------------^ Comment
  return {
    type: NodeType.Comment,
    loc: cursor.value!.loc,
    raw: cursor.value!.raw
  };
}

function table(cursor: Cursor<Token>, input: string): Table | TableArray {
  // Table or TableArray
  //
  // [ key ]
  // ^-----^    TableKey
  //   ^-^      Key
  //
  // [[ key ]]
  // ^ ------^  TableArrayKey
  //    ^-^     Key
  //
  // a = "b"  < Items
  // # c      |
  // d = "f"  <
  //
  // ...
  const type =
    !cursor.peek().done && cursor.peek().value!.type === TokenType.Bracket
      ? NodeType.TableArray
      : NodeType.Table;
  const is_table = type === NodeType.Table;

  if (is_table && cursor.value!.raw !== '[') {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Expected table opening "[", found ${cursor.value!.raw}`
    );
  }
  if (!is_table) {
    const next = cursor.peek();
    if (next.done) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        'Expected "[[" for Array of Tables, found end of input'
      );
    }
    if (cursor.value!.raw !== '[' || next.value!.raw !== '[') {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Expected "[[", found ${cursor.value!.raw + next.value!.raw}`
      );
    }

    // Validate that table array brackets are immediately adjacent (no whitespace)
    const firstBracket = cursor.value!;
    const secondBracket = next.value!;
    // Check if brackets are on the same line and adjacent columns
    if (firstBracket.loc.end.line !== secondBracket.loc.start.line ||
        firstBracket.loc.end.column !== secondBracket.loc.start.column) {
      throw new ParseError(
        input,
        firstBracket.loc.start,
        '"[[" brackets must be adjacent (no whitespace)'
      );
    }
  }

  // Set start location from opening tag
  const key = is_table
    ? ({
        type: NodeType.TableKey,
        loc: cursor.value!.loc
      } as Partial<TableKey>)
    : ({
        type: NodeType.TableArrayKey,
        loc: cursor.value!.loc
      } as Partial<TableArrayKey>);

  // Skip to cursor.value for key value
  cursor.next();
  if (type === NodeType.TableArray) cursor.next();

  if (cursor.done) {
    throw new ParseError(input, key.loc!.start, `Expected table key, reached end of file`);
  }

  // Check if the table/array name is empty (e.g., [[]] or [])
  if (cursor.value!.type === TokenType.Bracket && cursor.value!.raw === ']') {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      type === NodeType.TableArray 
        ? 'Array of Tables header [[]] requires a table name'
        : 'Table header [] requires a table name'
    );
  }

  // Validate table key
  const raw = cursor.value!.raw;
  rejectMultilineKey(raw, input, cursor.value!.loc.start);
  const isQuoted = raw.startsWith('"') || raw.startsWith("'");
  if (!isQuoted) {
    validateBareKeyChars(raw, input, cursor.value!.loc.start);
  }

  let keyValue;
  keyValue = [parseKeyString(cursor.value!.raw, input, cursor.value!.loc.start)];
  
  key.item = {
    type: NodeType.Key,
    loc: cursor.value!.loc,
    raw: cursor.value!.raw,
    value: keyValue
  };

  while (!cursor.peek().done && cursor.peek().value!.type === TokenType.Dot) {
    cursor.next();
    const dot = cursor.value!;

    cursor.next();
    
    // Validate each part of a dotted table key
    const partRaw = cursor.value!.raw;
    const partIsQuoted = partRaw.startsWith('"') || partRaw.startsWith("'");
    if (!partIsQuoted) {
      validateBareKeyChars(partRaw, input, cursor.value!.loc.start);
    }
    
    const before = ' '.repeat(dot.loc.start.column - key.item.loc.end.column);
    const after = ' '.repeat(cursor.value!.loc.start.column - dot.loc.end.column);

    key.item.loc.end = cursor.value!.loc.end;
    key.item.raw += `${before}.${after}${cursor.value!.raw}`;
    try {
      key.item.value.push(parseString(cursor.value!.raw));
    } catch (err) {
      const e = err as Error;
      throw new ParseError(input, cursor.value!.loc.start, e.message);
    }
  }

  cursor.next();

  // Table headers must not contain newlines - all parts must be on the same line
  // Example invalid TOML (table/newline-01): [tbl\n]
  // Example invalid TOML (table/newline-03): ["tbl"\n]
  if (!cursor.done) {
    const headerStartLine = is_table
      ? key.loc!.start.line
      : key.loc!.start.line; // Both use the opening bracket line
    
    if (cursor.value!.loc.start.line !== headerStartLine) {
      const closingBracket = is_table ? ']' : ']]';
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        is_table
          ? `Table header must be single-line`
          : `Array of Tables header must be single-line`
      );
    }
  }

  if (is_table && (cursor.done || cursor.value!.raw !== ']')) {
    throw new ParseError(
      input,
      cursor.done ? key.item.loc.end : cursor.value!.loc.start,
      `Expected table closing "]", found ${cursor.done ? 'end of file' : cursor.value!.raw}`
    );
  }
  if (
    !is_table &&
    (cursor.done ||
      cursor.peek().done ||
      cursor.value!.raw !== ']' ||
      cursor.peek().value!.raw !== ']')
  ) {
    throw new ParseError(
      input,
      cursor.done || cursor.peek().done ? key.item.loc.end : cursor.value!.loc.start,
      `Expected "]]" closing, found ${
        cursor.done || cursor.peek().done
          ? 'end of file'
          : cursor.value!.raw + cursor.peek().value!.raw
      }`
    );
  }

  // Validate that table array closing brackets are immediately adjacent (no whitespace)
  if (!is_table) {
    const firstBracket = cursor.value!;
    const secondBracket = cursor.peek().value!;
    // Check if brackets are on the same line and adjacent columns
    if (firstBracket.loc.end.line !== secondBracket.loc.start.line ||
        firstBracket.loc.end.column !== secondBracket.loc.start.column) {
      throw new ParseError(
        input,
        firstBracket.loc.start,
        '"]]" brackets must be adjacent (no whitespace)'
      );
    }
  }

  // Set end location from closing tag
  if (!is_table) cursor.next();
  key.loc!.end = cursor.value!.loc.end;

  // Table/array headers must be alone on their line - nothing can follow the closing bracket(s)
  // Example invalid TOML (key/after-table): [error] this = "should not be here"
  // Example invalid TOML (key/after-array): [[agencies]] owner = "S Cjelli"
  if (!cursor.peek().done) {
    const nextToken = cursor.peek().value!;
    // Check if there's content on the same line after the closing bracket
    // Comments are the only thing allowed on the same line
    if (nextToken.loc.start.line === key.loc!.end.line &&
        nextToken.type !== TokenType.Comment) {
      throw new ParseError(
        input,
        nextToken.loc.start,
        `Extra content after ${is_table ? 'table' : 'Array of Tables'} header`
      );
    }
  }

  // Add child items
  let items: Array<KeyValue | Comment> = [];
  while (!cursor.peek().done && cursor.peek().value!.type !== TokenType.Bracket) {
    cursor.next();
    const blocks = walkBlock(cursor, input) as Array<KeyValue | Comment>;
    // Push directly instead of merge to avoid function call overhead
    for (let bi = 0; bi < blocks.length; bi++) {
      items.push(blocks[bi]);
    }
  }

  return {
    type: is_table ? NodeType.Table : NodeType.TableArray,
    loc: {
      start: clonePosition(key.loc!.start),
      end: items.length
        ? clonePosition(items[items.length - 1].loc.end)
        : clonePosition(key.loc!.end)
    },
    key: key as TableKey | TableArrayKey,
    items
  } as Table | TableArray;
}

function string(cursor: Cursor<Token>, input: string): String {
  const value = parseKeyString(cursor.value!.raw, input, cursor.value!.loc.start);
  
  return {
    type: NodeType.String,
    loc: cursor.value!.loc,
    raw: cursor.value!.raw,
    value
  };
}

function boolean(cursor: Cursor<Token>): Boolean {
  return {
    type: NodeType.Boolean,
    loc: cursor.value!.loc,
    value: cursor.value!.raw === TRUE
  };
}

function datetime(cursor: Cursor<Token>, input: string): DateTime {
  // Possible values:
  //
  // Offset Date-Time
  // | odt1 = 1979-05-27T07:32:00Z
  // | odt2 = 1979-05-27T00:32:00-07:00
  // | odt3 = 1979-05-27T00:32:00.999999-07:00
  // | odt4 = 1979-05-27 07:32:00Z
  //
  // Local Date-Time
  // | ldt1 = 1979-05-27T07:32:00
  // | ldt2 = 1979-05-27T00:32:00.999999
  //
  // Local Date
  // | ld1 = 1979-05-27
  //
  // Local Time
  // | lt1 = 07:32:00
  // | lt2 = 00:32:00.999999
  let loc = cursor.value!.loc;
  let raw = cursor.value!.raw;
  let value: Date;

  // If next token is string,
  // check if raw is full date and following is full time
  if (
    !cursor.peek().done &&
    cursor.peek().value!.type === TokenType.Literal &&
    dateFormatHelper.IS_FULL_DATE.test(raw) &&
    dateFormatHelper.IS_FULL_TIME.test(cursor.peek().value!.raw)
  ) {
    const start = loc.start;

    cursor.next();
    loc = { start, end: cursor.value!.loc.end };
    raw += ` ${cursor.value!.raw}`;
  }

  if (!cursor.peek().done && cursor.peek().value!.type === TokenType.Dot) {
    const start = loc.start;

    cursor.next();

    if (cursor.peek().done || cursor.peek().value!.type !== TokenType.Literal) {
      throw new ParseError(input, cursor.value!.loc.end, `Expected fractional value for DateTime`);
    }
    cursor.next();

    loc = { start, end: cursor.value!.loc.end };
    raw += `.${cursor.value!.raw}`;
  }

  // Validate datetime format
  {
    validateDateTimeFormat(raw, input, loc.start);
  }

  if (!dateFormatHelper.IS_FULL_DATE.test(raw)) {
    // Local time only (e.g., "07:32:00" or "07:32:00.999")
    if (dateFormatHelper.IS_TIME_ONLY.test(raw)) {
      value = new LocalTime(raw, raw) as any;
    } else {
      // For other time formats, use local ISO date
      const [local_date] = new Date().toISOString().split('T');
      value = new Date(`${local_date}T${raw}`);
    }
  } else if (dateFormatHelper.IS_DATE_ONLY.test(raw)) {
    // Local date only (e.g., "1979-05-27")
    value = new LocalDate(raw) as any;
  } else if (dateFormatHelper.IS_LOCAL_DATETIME_T.test(raw)) {
    // Local datetime with T separator (e.g., "1979-05-27T07:32:00")
    value = new LocalDateTime(raw, false) as any;
  } else if (dateFormatHelper.IS_LOCAL_DATETIME_SPACE.test(raw)) {
    // Local datetime with space separator (e.g., "1979-05-27 07:32:00")
    value = new LocalDateTime(raw, true) as any;
  } else if (dateFormatHelper.IS_OFFSET_DATETIME_T.test(raw)) {
    // Offset datetime with T separator (e.g., "1979-05-27T07:32:00Z" or "1979-05-27T07:32:00-07:00")
    value = new OffsetDateTime(raw, false) as any;
  } else if (dateFormatHelper.IS_OFFSET_DATETIME_SPACE.test(raw)) {
    // Offset datetime with space separator (e.g., "1979-05-27 07:32:00Z")
    value = new OffsetDateTime(raw, true) as any;
  } else {
    // Default: offset datetime with T separator or any other format
    value = new Date(raw.replace(' ', 'T'));
  }

  return {
    type: NodeType.DateTime,
    loc,
    raw,
    value
  };
}

// Helper function to calculate days in a month for any year (including 0-99)
// JavaScript's Date constructor treats years 0-99 as 1900-1999, so we need manual calculation
function getDaysInMonth(year: number, month: number): number {
  // Month is 1-12
  const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  
  if (month === 2) {
    // Check if it's a leap year
    // Leap year rules: divisible by 4, except century years (divisible by 100) unless also divisible by 400
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }
  
  return daysPerMonth[month - 1];
}

// Helper function to validate datetime format
function validateDateTimeFormat(raw: string, input: string, loc: any): void {
  // Group 9: fractional seconds and timezone offset validation.
  // Reject fractional seconds with no digits after the dot (e.g. "...:09.Z" or "...:09.+01:00").
  if (/\.([Zz]|[+-])/.test(raw)) {
    throw new ParseError(
      input,
      loc,
      `"${raw}": fractional seconds needs digit after dot`
    );
  }

  // Reject trailing +/- without hour/minute (e.g., "...+" or "...-")
  if (/[+-]$/.test(raw)) {
    throw new ParseError(
      input,
      loc,
      `"${raw}": offset needs HH:MM`
    );
  }

  // If an offset is present, it must be [+-]HH:MM and only after a time component.
  // (Avoid accidentally matching date hyphens by requiring a time first.)
  const hasTime = /\d{2}:\d{2}/.test(raw);
  const offsetMatch = hasTime ? raw.match(/([+-])(\d+)(:?)(\d*)$/) : null;
  if (offsetMatch) {

    const fullOffset = offsetMatch[0];
    const hours = offsetMatch[2];
    const colon = offsetMatch[3];
    const minutes = offsetMatch[4];

    if (colon !== ':') {
      throw new ParseError(
        input,
        loc,
        `Offset "${fullOffset}": missing colon separator`
      );
    }

    if (hours.length !== 2) {
      throw new ParseError(
        input,
        loc,
        `Offset "${fullOffset}": hour must be 2 digits`
      );
    }

    if (!minutes || minutes.length === 0) {
      throw new ParseError(
        input,
        loc,
        `Offset "${fullOffset}": minute required`
      );
    }
    if (minutes.length !== 2) {
      throw new ParseError(
        input,
        loc,
        `Offset "${fullOffset}": minute must be 2 digits`
      );
    }

    const hourNum = parseInt(hours, 10);
    if (hourNum < 0 || hourNum > 23) {
      throw new ParseError(
        input,
        loc,
        `Offset "${fullOffset}": hour must be 00-23`
      );
    }

    const minuteNum = parseInt(minutes, 10);
    if (minuteNum < 0 || minuteNum > 59) {
      throw new ParseError(
        input,
        loc,
        `Offset "${fullOffset}": minute must be 00-59`
      );
    }
  }

  // First, ensure the overall shape is valid (anchors matter).
  // This catches cases where regexes below might partially match a prefix and ignore trailing junk.
  const validDateTimePattern =
    /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?$/;
  const validTimePattern = /^\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;

  if (!validDateTimePattern.test(raw) && !validTimePattern.test(raw)) {
    // Date cannot end with trailing T without a time component
    if (/^\d{4}-\d{2}-\d{2}T$/.test(raw)) {
      throw new ParseError(
        input,
        loc,
        `"${raw}": 'T' requires time component`
      );
    }

    // Any unexpected character immediately after a date-only value.
    // Exclude T/t (date-time separators) from this check.
    if (/^\d{4}-\d{2}-\d{2}[a-su-zA-SU-Z]/.test(raw)) {
      throw new ParseError(input, loc, `Invalid date "${raw}": unexpected character after date`);
    }

    // Missing separator between date and time
    if (/^\d{4}-\d{2}-\d{2}\d{2}:\d{2}/.test(raw)) {
      throw new ParseError(
        input,
        loc,
        `"${raw}": missing 'T' or space separator`
      );
    }

    throw new ParseError(input, loc, `Invalid datetime "${raw}"`);
  }

  // Check for year with wrong number of digits (must be exactly 4)
  const yearMatch = raw.match(/^(\d+)-/);
  if (yearMatch && yearMatch[1].length !== 4) {
    throw new ParseError(
      input,
      loc,
      `"${raw}": year must be 4 digits`
    );
  }

  // Check for date with wrong number of digits for month/day BEFORE extracting components
  // Pattern should be YYYY-MM-DD (exactly 4, 2, 2 digits)
  const datePattern = /^(\d+)-(\d+)-(\d+)/;
  const dateMatch = raw.match(datePattern);
  if (dateMatch) {
    const [, , month, day] = dateMatch;
    if (month.length !== 2) {
      throw new ParseError(
        input,
        loc,
        `"${raw}": month must be 2 digits`
      );
    }
    if (day.length !== 2) {
      throw new ParseError(
        input,
        loc,
        `"${raw}": day must be 2 digits`
      );
    }
  }
  
  // Check for time with wrong number of digits for hour/minute/second
  const timePattern = /[T ](\d+):(\d+)(?::(\d+))?/;
  const timeMatch = raw.match(timePattern);
  if (timeMatch) {
    const [, hour, minute, second] = timeMatch;
    validateTimeDigits(hour, minute, second, raw, input, loc);
  }
  
  // Check for standalone time (no date prefix)
  const timeOnlyPattern = /^(\d+):(\d+)(?::(\d+))?/;
  const timeOnlyMatch = raw.match(timeOnlyPattern);
  if (timeOnlyMatch && !dateMatch) {
    const [, hour, minute, second] = timeOnlyMatch;
    validateTimeDigits(hour, minute, second, raw, input, loc);
  }
  
  // Extract components for range validation (now we know they have the right length)
  const dateTimeMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  const timeOnlyMatchExact = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  
  if (dateTimeMatch) {
    const [, year, month, day, hour, minute, second] = dateTimeMatch;
    
    // Validate month range (01-12)
    const monthNum = parseInt(month, 10);
    if (monthNum < 1 || monthNum > 12) {
      throw new ParseError(input, loc, `"${raw}": month must be 01-12`);
    }
    
    // Validate day range (01-31 depending on month)
    const dayNum = parseInt(day, 10);
    if (dayNum < 1 || dayNum > 31) {
      throw new ParseError(input, loc, `"${raw}": day must be 01-31`);
    }
    
    // Check if day is valid for the specific month
    const yearNum = parseInt(year, 10);
    const daysInMonth = getDaysInMonth(yearNum, monthNum);
    if (dayNum > daysInMonth) {
      throw new ParseError(input, loc, `"${raw}": day ${day} invalid for ${year}-${month}`);
    }
    
    // Validate time component ranges if present
    validateTimeRange(hour, minute, second, raw, input, loc);
  } else if (timeOnlyMatchExact) {
    const [, hour, minute, second] = timeOnlyMatchExact;
    validateTimeRange(hour, minute, second, raw, input, loc);
  }
}

function float(cursor: Cursor<Token>, input: string): Float {
  let loc = cursor.value!.loc;
  let raw = cursor.value!.raw;
  let value;

  if (IS_INF.test(raw)) {
    value = raw.startsWith('-') ? -Infinity : Infinity;
  } else if (IS_NAN.test(raw)) {
    value = NaN;
  } else if (!cursor.peek().done && cursor.peek().value!.type === TokenType.Dot) {
    const start = loc.start;
    
    {
      // Validate that we don't already have an exponent (e.g., 1e2 cannot have a fractional part after it)
      if (HAS_E.test(raw) && !IS_HEX.test(raw)) {
        throw new ParseError(
          input,
          loc.start,
          `Float "${raw}": dot after exponent`
        );
      }
      
      // Validate integer part before decimal point
      const intPart = raw;

      // Validate no leading zeros in integer part (after optional sign)
      validateLeadingZeros(intPart, input, loc.start, 'the integer part of a float');
      
      // Validate no leading dot (must have at least one digit before the dot)
      const withoutSign = intPart.replace(/^[+\-]/, '');
      if (withoutSign === '' || withoutSign === '_') {
        throw new ParseError(
          input,
          loc.start,
          `Float: digit required before dot`
        );
      }
      
      validateUnderscores(intPart, input, loc.start);
    }

    // From spec:
    // | A fractional part is a decimal point followed by one or more digits.
    //
    // -> Don't have to handle "4." (i.e. nothing behind decimal place)

    cursor.next();

    if (cursor.peek().done || cursor.peek().value!.type !== TokenType.Literal) {
      throw new ParseError(input, cursor.value!.loc.end, `Expected fraction value for Float`);
    }
    cursor.next();

    raw += `.${cursor.value!.raw}`;
    loc = { start, end: cursor.value!.loc.end };
    
    {
      // Validate underscore placement in fractional part
      const fracPart = cursor.value!.raw;
      
      // Validate that fractional part starts with a digit (not 'e')
      if (!/^\d/.test(fracPart)) {
        throw new ParseError(
          input,
          cursor.value!.loc.start,
          `Float: fraction must start with digit, found "${fracPart}"`
        );
      }
      
      validateUnderscores(fracPart, input, cursor.value!.loc.start, false);
      validateExponent(fracPart, raw, input, cursor.value!.loc.start);
    }
    
        value = Number(raw.replace(IS_DIVIDER, ''));
  } else {
    // Validate underscore placement in integer part (exponent-only floats like 1e5)
    validateUnderscores(raw, input, loc.start);
    validateExponent(raw, raw, input, loc.start);
    
    // Validate no dot after exponent (e.g., 1e2.3 is invalid)
    if (!cursor.peek().done && cursor.peek().value!.type === TokenType.Dot) {
      throw new ParseError(
        input,
        cursor.peek().value!.loc.start,
        `Float "${raw}.": dot after exponent`
      );
    }

    // Validate no leading zeros in integer part (after optional sign)
    validateLeadingZeros(raw, input, loc.start, 'the integer part of a float');
    
    value = Number(raw.replace(IS_DIVIDER, ''));
  }

  // Reject non-special floats that parse to NaN (e.g. "Inf", "NaN", "1ee2")
  if (Number.isNaN(value) && !IS_NAN.test(raw)) {
    throw new ParseError(input, loc.start, `Invalid float "${raw}"`);
  }

  return { type: NodeType.Float, loc, raw, value };
}

function integer(cursor: Cursor<Token>, input: string): Integer {
  const raw = cursor.value!.raw;
  const loc = cursor.value!.loc;

  // Guard: values that look like dates/times must never be parsed as integers.
  // (Prevents parseInt() from accepting prefixes like "199-09-09" -> 199.)
  if (
    /^\d{1,}-\d{1,}/.test(raw) ||
    /^\d{1,}:\d{1,}/.test(raw) ||
    /^\d{6}-\d{2}$/.test(raw)
  ) {
    throw new ParseError(input, loc.start, `Invalid integer "${raw}"`);
  }
  
  {
    // > Integer values -0 and +0 are valid and identical to an unprefixed zero
    if (raw === '-0' || raw === '+0') {
      return {
        type: NodeType.Integer,
        loc: loc,
        raw: raw,
        value: 0
      };
    }

    // Validation: No double signs (++99, --99)
    if (/^[+\-]{2,}/.test(raw)) {
      throw new ParseError(
        input,
        loc.start,
        'Double sign is not allowed in integers'
      );
    }

    // Validation: No leading zeros (except for hex/octal/binary with prefixes)
    validateLeadingZeros(raw, input, loc.start, 'decimal integers');

    // Validation: underscore placement
    validateUnderscores(raw, input, loc.start);
  }

  let radix = 10;
  
  // Hexadecimal validation
  if (IS_HEX.test(raw)) {
    radix = 16;
    validatePrefixedInt(raw, input, loc.start, '0x', /^[0-9a-fA-F]+$/, 'Hexadecimal');
  }
  // Octal validation
  else if (IS_OCTAL.test(raw)) {
    radix = 8;
    validatePrefixedInt(raw, input, loc.start, '0o', /^[0-7]+$/, 'Octal', 'Invalid octal digits (must be 0-7)');
  }
  // Binary validation
  else if (IS_BINARY.test(raw)) {
    radix = 2;
    validatePrefixedInt(raw, input, loc.start, '0b', /^[01]+$/, 'Binary', 'Invalid binary digits (must be 0 or 1)');
  }

  const value = parseInt(
    raw
      .replace(IS_DIVIDER, '')
      .replace(IS_OCTAL, '')
      .replace(IS_BINARY, ''),
    radix
  );

  if (Number.isNaN(value)) {
    throw new ParseError(input, loc.start, `Invalid integer "${raw}"`);
  }

  return {
    type: NodeType.Integer,
    loc: loc,
    raw: raw,
    value
  };
}

/**
 * Walk a Block (Comment, Table, or KeyValue)
 * This new version avoids recursion for key-value pairs to improve performance on large files.
 * @param cursor Cursor<Token>
 * @param input string
 * @returns Block[]
 */
function walkBlock(cursor: Cursor<Token>, input: string): Block[] {
  if (cursor.value!.type === TokenType.Comment) {
    return [comment(cursor)];
  } else if (cursor.value!.type === TokenType.Bracket) {
    // For tables, we can't easily avoid recursion, so just use the existing function
    // In practice, top-level tables aren't deeply nested
    return [table(cursor, input)];
  } else if (cursor.value!.type === TokenType.Literal) {
    return keyValue(cursor, input);
  } else if (cursor.value!.type === TokenType.Equal) {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Missing key before '='`
    );
  } else {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Unexpected token "${cursor.value!.type}"`
    );
  }
}

/**
 * Walk a KeyValue pair or Comment
 * This new version avoids recursion for key-value pairs to improve performance on large files.
 * @param cursor Cursor<Token>
 * @param input string
 * @returns Array<KeyValue | Comment>
 */
function keyValue(cursor: Cursor<Token>, input: string): Array<KeyValue | Comment> {
  // 3. KeyValue
  //
  // key = value
  // ^-^          key
  //     ^        equals
  //       ^---^  value

  // Match the more helpful diagnostic when users write `key: value`.
  // Depending on tokenization, the ':' may be attached to the key token (e.g. 'name:').
  const rawKeyToken = cursor.value!.raw;
  if (rawKeyToken.endsWith(':')) {
    throw new ParseError(
      input,
      { line: cursor.value!.loc.start.line, column: cursor.value!.loc.start.column + [...rawKeyToken].length - 1 },
      `Use '=' to separate keys and values, not ':'`
    );
  }
  // Validate key
  rejectMultilineKey(rawKeyToken, input, cursor.value!.loc.start);
  const isQuotedKey = rawKeyToken.startsWith('"') || rawKeyToken.startsWith("'");
  if (!isQuotedKey) {
    validateBareKeyChars(rawKeyToken, input, cursor.value!.loc.start);
  }

  let keyValue2;
  keyValue2 = [parseKeyString(cursor.value!.raw, input, cursor.value!.loc.start)];
  
  const key: Key = {
    type: NodeType.Key,
    loc: cursor.value!.loc,
    raw: cursor.value!.raw,
    value: keyValue2
  };

  while (!cursor.peek().done && cursor.peek().value!.type === TokenType.Dot) {
    cursor.next();
    cursor.next();

    // Validate each part of a dotted key
    const partRaw = cursor.value!.raw;
    rejectMultilineKey(partRaw, input, cursor.value!.loc.start);
    const partIsQuoted = partRaw.startsWith('"') || partRaw.startsWith("'");
    if (!partIsQuoted) {
      validateBareKeyChars(partRaw, input, cursor.value!.loc.start);
    }

    key.loc.end = cursor.value!.loc.end;
    key.raw += `.${cursor.value!.raw}`;
    key.value.push(parseKeyString(cursor.value!.raw, input, cursor.value!.loc.start));
  }

  cursor.next();

  // TOML key/value pairs must include '=' on the same line as the key.
  // Example invalid TOML (spec: bare-key-2):
  //   barekey\n   = 123
  if (!cursor.done && cursor.value!.loc.start.line !== key.loc.end.line) {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `"=" must be on same line as key`
    );
  }

  if (cursor.done || cursor.value!.type !== TokenType.Equal) {
    if (!cursor.done && cursor.value!.raw === ':') {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Use '=' to separate keys and values, not ':'`
      );
    }
    throw new ParseError(
      input,
      cursor.done ? key.loc.end : cursor.value!.loc.start,
      `Expected "=" for key-value`
    );
  }

  const equals = cursor.value!.loc.start.column;
  const equalsLine = cursor.value!.loc.start.line;
  cursor.next();

  if (cursor.done) {
    throw new ParseError(input, key.loc.start, `Expected value, reached EOF`);
  }

  // TOML values must be on the same line as the '=' sign.
  // Example invalid TOML (key/newline-06):
  //   key =\n1
  if (cursor.value!.loc.start.line !== equalsLine) {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Value must be on same line as '='`
    );
  }

  if (cursor.done) {
    throw new ParseError(input, key.loc.start, `Expected value for key-value`);
  }

  const results = walkValue(cursor, input);
  const value = results[0] as Value;

  // Key/value pairs must be separated by a newline (or EOF). Whitespace alone isn't enough.
  // Example invalid TOML: first = "Tom" last = "Preston-Werner"
  //
  // Note: don't reject valid inline-tables like { a = 1, b = 2 } where tokens like ',' or '}'
  // legitimately follow a value on the same line.
  if (!cursor.peek().done) {
    const nextToken = cursor.peek().value!;
    
    // Check for Dot token after a numeric value (likely multiple decimal points)
    if (nextToken.type === TokenType.Dot && 
        nextToken.loc.start.line === value.loc.end.line &&
        (value.type === NodeType.Float || value.type === NodeType.Integer)) {
      throw new ParseError(
        input,
        nextToken.loc.start,
        'Invalid number: multiple decimal points not allowed'
      );
    }
    
    const startsNewStatement =
      nextToken.type === TokenType.Literal ||
      nextToken.type === TokenType.Bracket;

    if (startsNewStatement && nextToken.loc.start.line === value.loc.end.line) {
      throw new ParseError(
        input,
        nextToken.loc.start,
        'Key/value pairs must be separated by a newline'
      );
    }
  }

  // Reuse the walkValue result array: replace position 0 with the KeyValue node.
  // Comments (if any) remain at indices 1+, avoiding a new array allocation + spread.
  results[0] = {
    type: NodeType.KeyValue,
    key,
    value: value as Value,
    loc: { start: clonePosition(key.loc.start), end: clonePosition(value.loc.end) },
    equals
  } as any;
  return results as unknown as Array<KeyValue | Comment>;
}

function walkValue(cursor: Cursor<Token>, input: string): Array<Value | Comment> {
  if (cursor.value!.type === TokenType.Literal) {
    const raw = cursor.value!.raw;

    if (raw[0] === DOUBLE_QUOTE || raw[0] === SINGLE_QUOTE) {
      return [string(cursor, input)];
    } else if (raw === TRUE || raw === FALSE) {
      return [boolean(cursor)];

    // Route anything that looks like a date or time through datetime() so invalid formats throw,
    // instead of being mis-parsed as integers (e.g., "199-09-09" -> 199).
    } else if (
      /^\d/.test(raw) &&
      (/^\d{1,}-\d{1,}/.test(raw) || /^\d{1,}:\d{1,}/.test(raw))
    ) {
      return [datetime(cursor, input)];
    } else if (
      (!cursor.peek().done && cursor.peek().value!.type === TokenType.Dot) ||
      IS_INF.test(raw) ||
      IS_NAN.test(raw) ||
      (HAS_E.test(raw) && !IS_HEX.test(raw))
    ) {
      return [float(cursor, input)];
    } else {
      return [integer(cursor, input)];
    }
  } else if (cursor.value!.type === TokenType.Curly) {
    const [inline_table, comments] = inlineTable(cursor, input);
    return [inline_table, ...comments];
  } else if (cursor.value!.type === TokenType.Bracket) {
    const [inline_array, comments] = inlineArray(cursor, input);
    return [inline_array, ...comments];
  } else if (cursor.value!.type === TokenType.Dot) {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Number cannot start with a dot`
    );
  } else {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Unrecognized token type`
    );
  }
}

function inlineTable(cursor: Cursor<Token>, input: string): [InlineTable, Comment[]] {
  if (cursor.value!.raw !== '{') {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Expected "{" for inline table`
    );
  }

  // 6. InlineTable
  const value: InlineTable = {
    type: NodeType.InlineTable,
    loc: cursor.value!.loc,
    items: []
  };

  const comments: Comment[] = [];
  cursor.next();

  while (
    !cursor.done &&
    !(cursor.value!.type === TokenType.Curly && (cursor.value as Token).raw === '}')
  ) {
    if (cursor.value!.type === TokenType.Comment) {
      comments.push(comment(cursor));
      cursor.next();
      continue;
    }

    if ((cursor.value as Token).type === TokenType.Comma) {
      const previous = value.items[value.items.length - 1];
      if (!previous) {
        throw new ParseError(
          input,
          cursor.value!.loc.start,
          'Leading comma in inline table'
        );
      }

      if (previous.comma) {
        throw new ParseError(
          input,
          cursor.value!.loc.start,
          'Consecutive commas in inline table'
        );
      }

      previous.comma = true;
      previous.loc.end = cursor.value!.loc.start;
      cursor.next();
      continue;
    }

    const previous = value.items[value.items.length - 1];
    if (previous && !previous.comma) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        'Missing comma between inline table items'
      );
    }

    // Recursively parse the key-value, but without generators
    const blocks = walkBlock(cursor, input);
    const item = blocks[0];

    if (item.type === NodeType.KeyValue) {
      value.items.push({
        type: NodeType.InlineItem,
        loc: cloneLocation(item.loc),
        item: item as KeyValue,
        comma: false
      });
      // Push remaining comments directly instead of slice + merge
      for (let ci = 1; ci < blocks.length; ci++) {
        comments.push(blocks[ci] as Comment);
      }
    }

    cursor.next();
  }

  if (
    cursor.done ||
    cursor.value!.type !== TokenType.Curly ||
    (cursor.value as Token).raw !== '}'
  ) {
    throw new ParseError(
      input,
      cursor.done ? value.loc.start : cursor.value!.loc.start,
      `Expected "}"`
    );
  }

  value.loc.end = cursor.value!.loc.end;
  return [value, comments];
}

function inlineArray(cursor: Cursor<Token>, input: string): [InlineArray, Comment[]] {
  // 7. InlineArray
  if (cursor.value!.raw !== '[') {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Expected "[" for inline array`
    );
  }

  const value: InlineArray = {
    type: NodeType.InlineArray,
    loc: cursor.value!.loc,
    items: []
  };

  const comments: Comment[] = [];
  cursor.next();

  while (
    !cursor.done &&
    !(cursor.value!.type === TokenType.Bracket && (cursor.value as Token).raw === ']')
  ) {
    if ((cursor.value as Token).type === TokenType.Comma) {
      const previous = value.items[value.items.length - 1];
      if (!previous) {
        throw new ParseError(
          input,
          cursor.value!.loc.start,
          'Leading comma in array'
        );
      }

      if (previous.comma) {
        throw new ParseError(
          input,
          cursor.value!.loc.start,
          'Consecutive commas in array'
        );
      }

      previous.comma = true;
      previous.loc.end = cursor.value!.loc.start;
    } else if ((cursor.value as Token).type === TokenType.Comment) {
      comments.push(comment(cursor));
    } else {
      const previous = value.items[value.items.length - 1];
      if (previous && !previous.comma) {
        throw new ParseError(input, cursor.value!.loc.start, 'Missing comma between array elements');
      }

      const results = walkValue(cursor, input);
      const item = results[0];

      value.items.push({
        type: NodeType.InlineItem,
        loc: cloneLocation(item.loc),
        item,
        comma: false
      });
      // Push remaining comments directly instead of slice + merge
      for (let ci = 1; ci < results.length; ci++) {
        comments.push(results[ci] as Comment);
      }
    }

    cursor.next();
  }

  if (
    cursor.done ||
    cursor.value!.type !== TokenType.Bracket ||
    (cursor.value as Token).raw !== ']'
  ) {
    throw new ParseError(
      input,
      cursor.done ? value.loc.start : cursor.value!.loc.start,
      `Expected "]"`
    );
  }

  value.loc.end = cursor.value!.loc.end;
  return [value, comments];
}
