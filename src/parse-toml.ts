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
import { merge } from './utils';

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
const IS_INF = /inf/i;
const IS_NAN = /nan/i;
const IS_HEX = /^0x/;
const IS_OCTAL = /^0o/;
const IS_BINARY = /^0b/;

// Export the date classes for external use
export {
  LocalDate,
  LocalTime,
  LocalDateTime,
  OffsetDateTime,
  DateFormatHelper
} from './date-format';

export default function* parseTOML(input: string): AST {
  const tokens = tokenize(input);
  const cursor = new Cursor(tokens);

  while (!cursor.next().done) {
    yield* walkBlock(cursor, input);
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
  
  // Parse and yield all items from the remaining string
  for (const item of parseTOML(remainingString)) {
    yield item;
  }
}

function* walkBlock(cursor: Cursor<Token>, input: string): IterableIterator<Block> {
  if (cursor.value!.type === TokenType.Comment) {
    yield comment(cursor);
  } else if (cursor.value!.type === TokenType.Bracket) {
    yield table(cursor, input);
  } else if (cursor.value!.type === TokenType.Literal) {
    yield* keyValue(cursor, input);
  } else {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Unexpected token "${cursor.value!.type}". Expected Comment, Bracket, or String`
    );
  }
}

function* walkValue(cursor: Cursor<Token>, input: string): IterableIterator<Value | Comment> {
  if (cursor.value!.type === TokenType.Literal) {
    if (cursor.value!.raw[0] === DOUBLE_QUOTE || cursor.value!.raw[0] === SINGLE_QUOTE) {
      yield string(cursor);
    } else if (cursor.value!.raw === TRUE || cursor.value!.raw === FALSE) {
      yield boolean(cursor, input);
    } else if (/^(true|false)$/i.test(cursor.value!.raw) || /^[tf]/i.test(cursor.value!.raw)) {
      // Catch invalid boolean-like values (TRUE, False, t, f, tru, etc.)
      yield boolean(cursor, input);
    } else if (dateFormatHelper.IS_FULL_DATE.test(cursor.value!.raw) || dateFormatHelper.IS_FULL_TIME.test(cursor.value!.raw)) {
      yield datetime(cursor, input);
    } else if (
      (!cursor.peek().done && cursor.peek().value!.type === TokenType.Dot) ||
      IS_INF.test(cursor.value!.raw) ||
      IS_NAN.test(cursor.value!.raw) ||
      (HAS_E.test(cursor.value!.raw) && !IS_HEX.test(cursor.value!.raw))
    ) {
      yield float(cursor, input);
    } else if (/^[+-]?[inINaA]/i.test(cursor.value!.raw)) {
      // Catch incomplete or invalid inf/nan values (in, na, Inf, NAN, etc.)
      yield float(cursor, input);
    } else {
      yield integer(cursor, input);
    }
  } else if (cursor.value!.type === TokenType.Curly) {
    yield inlineTable(cursor, input);
  } else if (cursor.value!.type === TokenType.Bracket) {
    const [inline_array, comments] = inlineArray(cursor, input);

    yield inline_array;
    yield* comments;
  } else {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Unrecognized token type "${cursor.value!.type}". Expected String, Curly, or Bracket`
    );
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
  if (!is_table && (cursor.value!.raw !== '[' || cursor.peek().value!.raw !== '[')) {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Expected array of tables opening "[[", found ${cursor.value!.raw + cursor.peek().value!.raw}`
    );
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

  key.item = {
    type: NodeType.Key,
    loc: cloneLocation(cursor.value!.loc),
    raw: cursor.value!.raw,
    value: [parseString(cursor.value!.raw)]
  };

  while (!cursor.peek().done && cursor.peek().value!.type === TokenType.Dot) {
    cursor.next();
    const dot = cursor.value!;

    cursor.next();
    const before = ' '.repeat(dot.loc.start.column - key.item.loc.end.column);
    const after = ' '.repeat(cursor.value!.loc.start.column - dot.loc.end.column);

    key.item.loc.end = cursor.value!.loc.end;
    key.item.raw += `${before}.${after}${cursor.value!.raw}`;
    key.item.value.push(parseString(cursor.value!.raw));
  }

  cursor.next();

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
      `Expected array of tables closing "]]", found ${
        cursor.done || cursor.peek().done
          ? 'end of file'
          : cursor.value!.raw + cursor.peek().value!.raw
      }`
    );
  }

  // Set end location from closing tag
  if (!is_table) cursor.next();
  key.loc!.end = cursor.value!.loc.end;

  // Add child items
  let items: Array<KeyValue | Comment> = [];
  while (!cursor.peek().done && cursor.peek().value!.type !== TokenType.Bracket) {
    cursor.next();
    merge(items, [...walkBlock(cursor, input)] as Array<KeyValue | Comment>);
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

function keyValue(cursor: Cursor<Token>, input: string): Array<KeyValue | Comment> {
  // 3. KeyValue
  //
  // key = value
  // ^-^          key
  //     ^        equals
  //       ^---^  value
  const key: Key = {
    type: NodeType.Key,
    loc: cloneLocation(cursor.value!.loc),
    raw: cursor.value!.raw,
    value: [parseString(cursor.value!.raw)]
  };

  while (!cursor.peek().done && cursor.peek().value!.type === TokenType.Dot) {
    cursor.next();
    cursor.next();

    key.loc.end = cursor.value!.loc.end;
    key.raw += `.${cursor.value!.raw}`;
    key.value.push(parseString(cursor.value!.raw));
  }

  cursor.next();

  if (cursor.done || cursor.value!.type !== TokenType.Equal) {
    throw new ParseError(
      input,
      cursor.done ? key.loc.end : cursor.value!.loc.start,
      `Expected "=" for key-value, found ${cursor.done ? 'end of file' : cursor.value!.raw}`
    );
  }

  const equals = cursor.value!.loc.start.column;

  cursor.next();

  if (cursor.done) {
    throw new ParseError(input, key.loc.start, `Expected value for key-value, reached end of file`);
  }

  const [value, ...comments] = walkValue(cursor, input) as Iterable<Value | Comment>;

  return [
    {
      type: NodeType.KeyValue,
      key,
      value: value as Value,
      loc: {
        start: clonePosition(key.loc.start),
        end: clonePosition(value.loc.end)
      },
      equals
    },
    ...(comments as Comment[])
  ];
}

function string(cursor: Cursor<Token>): String {
  return {
    type: NodeType.String,
    loc: cursor.value!.loc,
    raw: cursor.value!.raw,
    value: parseString(cursor.value!.raw)
  };
}

function boolean(cursor: Cursor<Token>, input: string): Boolean {
  // Validate that the value is exactly 'true' or 'false' (case-sensitive)
  const raw = cursor.value!.raw;
  if (raw !== TRUE && raw !== FALSE) {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Invalid boolean value "${raw}". Expected "true" or "false" (lowercase only)`
    );
  }
  
  return {
    type: NodeType.Boolean,
    loc: cursor.value!.loc,
    value: raw === TRUE
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

function float(cursor: Cursor<Token>, input: string): Float {
  let loc = cursor.value!.loc;
  let raw = cursor.value!.raw;
  let value;

  if (IS_INF.test(raw)) {
    // Validate exact format: 'inf', '+inf', '-inf' (lowercase only)
    if (raw !== 'inf' && raw !== '+inf' && raw !== '-inf') {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float "${raw}": infinity must be exactly "inf", "+inf", or "-inf" (lowercase only)`
      );
    }
    value = raw === '-inf' ? -Infinity : Infinity;
  } else if (IS_NAN.test(raw)) {
    // Validate exact format: 'nan', '+nan', '-nan' (lowercase only)
    if (raw !== 'nan' && raw !== '+nan' && raw !== '-nan') {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float "${raw}": NaN must be exactly "nan", "+nan", or "-nan" (lowercase only)`
      );
    }
    value = raw === '-nan' ? -NaN : NaN;
  } else if (!cursor.peek().done && cursor.peek().value!.type === TokenType.Dot) {
    const start = loc.start;

    // Validate underscore placement in integer part (no leading, trailing underscores)
    if (/_$/.test(raw)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float "${raw}": underscore before decimal point is not allowed`
      );
    }
    if (/^[+\-]?_/.test(raw)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float "${raw}": leading underscore is not allowed`
      );
    }
    if (/__/.test(raw)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float "${raw}": consecutive underscores are not allowed`
      );
    }

    // From spec:
    // | A fractional part is a decimal point followed by one or more digits.
    //
    // -> Don't have to handle "4." (i.e. nothing behind decimal place)

    // Validate no leading zeros for the integer part (except standalone 0)
    const integerPart = raw.replace(/^[+\-]/, '').replace(/_/g, '');
    if (/^0\d/.test(integerPart)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float "${raw}": leading zeros are not allowed`
      );
    }

    cursor.next();

    if (cursor.peek().done || cursor.peek().value!.type !== TokenType.Literal) {
      throw new ParseError(input, cursor.value!.loc.end, `Expected fraction value for Float`);
    }
    cursor.next();

    const fracPart = cursor.value!.raw;
    
    // Validate underscore placement in fractional part
    if (/^_/.test(fracPart)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float: underscore after decimal point is not allowed`
      );
    }
    if (/_$/.test(fracPart)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float: trailing underscore in fractional part is not allowed`
      );
    }
    if (/__/.test(fracPart)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float: consecutive underscores in fractional part are not allowed`
      );
    }

    raw += `.${fracPart}`;
    loc = { start, end: cursor.value!.loc.end };
    value = Number(raw.replace(IS_DIVIDER, ''));
  } else {
    // Validate underscore placement (no leading, trailing, or double underscores)
    if (/_$/.test(raw) && !/[eE]/.test(raw)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float "${raw}": trailing underscore is not allowed`
      );
    }
    if (/^[+\-]?_/.test(raw)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float "${raw}": leading underscore is not allowed`
      );
    }
    if (/__/.test(raw)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float "${raw}": consecutive underscores are not allowed`
      );
    }
    
    // Validate exponent format if present
    if (/[eE]/.test(raw)) {
      // Check for trailing underscore before E
      if (/_[eE]/.test(raw)) {
        throw new ParseError(
          input,
          cursor.value!.loc.start,
          `Invalid float "${raw}": underscore before exponent is not allowed`
        );
      }
      
      // Check for underscore after E or after sign in exponent
      if (/[eE][+\-]?_/.test(raw)) {
        throw new ParseError(
          input,
          cursor.value!.loc.start,
          `Invalid float "${raw}": underscore at start of exponent is not allowed`
        );
      }
      
      // Check for trailing underscore in exponent
      if (/_$/.test(raw)) {
        throw new ParseError(
          input,
          cursor.value!.loc.start,
          `Invalid float "${raw}": trailing underscore in exponent is not allowed`
        );
      }
      
      // Check for incomplete exponent (just E with nothing after)
      if (/[eE][+\-]?$/.test(raw)) {
        throw new ParseError(
          input,
          cursor.value!.loc.start,
          `Invalid float "${raw}": incomplete exponent`
        );
      }
      
      // Check for decimal point in exponent
      if (/[eE][+\-]?.*\./.test(raw)) {
        throw new ParseError(
          input,
          cursor.value!.loc.start,
          `Invalid float "${raw}": decimal point not allowed in exponent`
        );
      }
    }
    
    // Validate no leading zeros for floats with exponents
    const integerPart = raw.replace(/^[+\-]/, '').replace(/[eE].*$/, '').replace(/_/g, '');
    if (/^0\d/.test(integerPart)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float "${raw}": leading zeros are not allowed`
      );
    }
    value = Number(raw.replace(IS_DIVIDER, ''));
    
    // If the result is NaN but the raw value doesn't match valid nan format, it's invalid
    if (isNaN(value) && raw !== 'nan' && raw !== '+nan' && raw !== '-nan') {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid float "${raw}": not a valid number`
      );
    }
  }

  return { type: NodeType.Float, loc, raw, value };
}

function integer(cursor: Cursor<Token>, input: string): Integer {
  const raw = cursor.value!.raw;
  
  // > Integer values -0 and +0 are valid and identical to an unprefixed zero
  if (raw === '-0' || raw === '+0') {
    return {
      type: NodeType.Integer,
      loc: cursor.value!.loc,
      raw: raw,
      value: 0
    };
  }

  // Validate underscore placement (no leading, trailing, or double underscores)
  if (/_$/.test(raw)) {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Invalid integer "${raw}": underscores cannot be at the end`
    );
  }
  if (/^[+\-]?_/.test(raw)) {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Invalid integer "${raw}": underscores cannot be at the start`
    );
  }
  if (/__/.test(raw)) {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Invalid integer "${raw}": consecutive underscores are not allowed`
    );
  }

  // Validate no zero-padding for decimal integers
  // Check if it starts with 0 followed by digit (but allow 0x, 0o, 0b prefixes and standalone 0)
  if (/^[+\-]?0\d/.test(raw) && !IS_HEX.test(raw) && !IS_OCTAL.test(raw) && !IS_BINARY.test(raw)) {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Invalid integer "${raw}": leading zeros are not allowed`
    );
  }

  let radix = 10;
  let numericPart = raw;
  
  if (IS_HEX.test(raw)) {
    radix = 16;
    // Hex, octal, and binary integers cannot have signs
    if (raw[0] === '+' || raw[0] === '-') {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid integer "${raw}": non-decimal integers cannot have a sign prefix`
      );
    }
    // Check for incomplete hex (just "0x" with no digits)
    numericPart = raw.replace(/^0x/i, '');
    if (!numericPart || numericPart === '_' || /^_/.test(numericPart)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid integer "${raw}": incomplete hexadecimal number`
      );
    }
    // Validate hex digits (after removing underscores)
    const hexDigits = numericPart.replace(/_/g, '');
    if (!/^[0-9a-fA-F]+$/.test(hexDigits)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid integer "${raw}": invalid hexadecimal digits`
      );
    }
  } else if (IS_OCTAL.test(raw)) {
    radix = 8;
    if (raw[0] === '+' || raw[0] === '-') {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid integer "${raw}": non-decimal integers cannot have a sign prefix`
      );
    }
    // Check for incomplete octal
    numericPart = raw.replace(/^0o/i, '');
    if (!numericPart || numericPart === '_' || /^_/.test(numericPart)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid integer "${raw}": incomplete octal number`
      );
    }
    // Validate octal digits (after removing underscores)
    const octalDigits = numericPart.replace(/_/g, '');
    if (!/^[0-7]+$/.test(octalDigits)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid integer "${raw}": invalid octal digits (must be 0-7)`
      );
    }
  } else if (IS_BINARY.test(raw)) {
    radix = 2;
    if (raw[0] === '+' || raw[0] === '-') {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid integer "${raw}": non-decimal integers cannot have a sign prefix`
      );
    }
    // Check for incomplete binary
    numericPart = raw.replace(/^0b/i, '');
    if (!numericPart || numericPart === '_' || /^_/.test(numericPart)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid integer "${raw}": incomplete binary number`
      );
    }
    // Validate binary digits (after removing underscores)
    const binaryDigits = numericPart.replace(/_/g, '');
    if (!/^[01]+$/.test(binaryDigits)) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Invalid integer "${raw}": invalid binary digits (must be 0 or 1)`
      );
    }
  }

  const value = parseInt(
    raw
      .replace(IS_DIVIDER, '')
      .replace(IS_OCTAL, '')
      .replace(IS_BINARY, ''),
    radix
  );

  return {
    type: NodeType.Integer,
    loc: cursor.value!.loc,
    raw: raw,
    value
  };
}

function inlineTable(cursor: Cursor<Token>, input: string): InlineTable {
  if (cursor.value!.raw !== '{') {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Expected "{" for inline table, found ${cursor.value!.raw}`
    );
  }

  // 6. InlineTable
  const value: InlineTable = {
    type: NodeType.InlineTable,
    loc: cloneLocation(cursor.value!.loc),
    items: []
  };

  cursor.next();

  while (
    !cursor.done &&
    !(cursor.value!.type === TokenType.Curly && (cursor.value as Token).raw === '}')
  ) {
    if ((cursor.value as Token).type === TokenType.Comma) {
      const previous = value.items[value.items.length - 1];
      if (!previous) {
        throw new ParseError(
          input,
          cursor.value!.loc.start,
          'Found "," without previous value in inline table'
        );
      }

      previous.comma = true;
      previous.loc.end = cursor.value!.loc.start;

      cursor.next();
      continue;
    }

    const [item] = walkBlock(cursor, input);
    if (item.type !== NodeType.KeyValue) {
      throw new ParseError(
        input,
        cursor.value!.loc.start,
        `Only key-values are supported in inline tables, found ${item.type}`
      );
    }

    const inline_item: InlineItem<KeyValue> = {
      type: NodeType.InlineItem,
      loc: cloneLocation(item.loc),
      item,
      comma: false
    };

    value.items.push(inline_item);
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
      `Expected "}", found ${cursor.done ? 'end of file' : cursor.value!.raw}`
    );
  }

  value.loc.end = cursor.value!.loc.end;

  return value;
}

function inlineArray(cursor: Cursor<Token>, input: string): [InlineArray, Comment[]] {
  // 7. InlineArray
  if (cursor.value!.raw !== '[') {
    throw new ParseError(
      input,
      cursor.value!.loc.start,
      `Expected "[" for inline array, found ${cursor.value!.raw}`
    );
  }

  const value: InlineArray = {
    type: NodeType.InlineArray,
    loc: cloneLocation(cursor.value!.loc),
    items: []
  };
  let comments: Comment[] = [];

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
          'Found "," without previous value for inline array'
        );
      }

      previous.comma = true;
      previous.loc.end = cursor.value!.loc.start;
    } else if ((cursor.value as Token).type === TokenType.Comment) {
      comments.push(comment(cursor));
    } else {
      const [item, ...additional_comments] = walkValue(cursor, input);
      const inline_item: InlineItem = {
        type: NodeType.InlineItem,
        loc: cloneLocation(item.loc),
        item,
        comma: false
      };

      value.items.push(inline_item);
      merge(comments, additional_comments as Comment[]);
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
      `Expected "]", found ${cursor.done ? 'end of file' : cursor.value!.raw}`
    );
  }

  value.loc.end = cursor.value!.loc.end;

  return [value, comments];
}
