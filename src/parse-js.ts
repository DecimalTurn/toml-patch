import { Value, KeyValue, Document, InlineArray, InlineTable } from './ast';
import {
  generateDocument,
  generateKeyValue,
  generateInlineItem,
  generateString,
  generateInteger,
  generateFloat,
  generateBoolean,
  generateDateTime,
  generateInlineArray,
  generateInlineTable
} from './generate';
import { TomlFormat } from './toml-format';
import { formatTopLevel, formatEmptyLines, formatNestedTablesMultiline } from './formatter';
import { isObject, isString, isInteger, isFloat, isBoolean, isDate } from './utils';
import { insert, applyWrites, applyBracketSpacing, applyTrailingComma } from './writer';

/**
 * Parses a JavaScript object into an AST Document, applying formatting options from TomlFormat.
 * @param value - The JavaScript object to parse.
 * @param format - The formatting options to apply.
 * @returns The resulting AST Document.
 */
export default function parseJS(value: any, format: TomlFormat = TomlFormat.default()): Document {
  value = toJSON(value);

  const document = generateDocument();
  for (const item of walkObject(value, format)) {
    insert(document, document, item);
  }
  applyWrites(document);

  // Heuristics:
  // 1. Top-level objects/arrays should be tables/table arrays
  // 2. Convert nested inline tables to separate tables based on preferNestedTablesMultiline
  formatTopLevel(document, format);
  formatNestedTablesMultiline(document, format);

  // Apply formatEmptyLines only once at the end
  return formatEmptyLines(document);
}

function* walkObject(object: any, format: TomlFormat): IterableIterator<KeyValue> {
  for (const key of Object.keys(object)) {
    if (object[key] === undefined) continue;
    yield generateKeyValue([key], walkValue(object[key], format));
  }
}

function walkValue(value: any, format: TomlFormat): Value {
  if (value === null) {
    throw new Error('"null" values are not supported');
  }
  if (value === undefined) {
    throw new Error('"undefined" values are not supported inside arrays');
  }

  if (isString(value)) {
    return generateString(value);
  } else if (isInteger(value)) {
    return generateInteger(value);
  } else if (isFloat(value)) {
    return generateFloat(value);
  } else if (isBoolean(value)) {
    return generateBoolean(value);
  } else if (isDate(value)) {
    return generateDateTime(value, format.truncateZeroTimeInDates);
  } else if (Array.isArray(value)) {
    return walkInlineArray(value, format);
  } else {
    return walkInlineTable(value, format);
  }
}

function walkInlineArray(value: Array<any>, format: TomlFormat): InlineArray {
  const inline_array = generateInlineArray();
  for (const element of value) {
    const item = walkValue(element, format);
    const inline_array_item = generateInlineItem(item);

    insert(inline_array, inline_array, inline_array_item);
  }
  applyBracketSpacing(inline_array, inline_array, format.bracketSpacing);
  applyTrailingComma(inline_array, inline_array, format.trailingComma);
  applyWrites(inline_array);

  return inline_array;
}

function walkInlineTable(value: object, format: TomlFormat): InlineTable | Value {
  value = toJSON(value);
  if (!isObject(value)) return walkValue(value, format);

  const inline_table = generateInlineTable();
  for (const item of walkObject(value, format)) {
    const inline_table_item = generateInlineItem(item);

    insert(inline_table, inline_table, inline_table_item);
  }
  applyBracketSpacing(inline_table, inline_table, format.bracketSpacing);
  applyTrailingComma(inline_table, inline_table, format.trailingComma);
  applyWrites(inline_table);

  return inline_table;
}

/**
 * Handles custom object serialization by checking for and using toJSON methods
 * 
 * @param value - The value to potentially convert
 * @returns The result of value.toJSON() if available, otherwise the original value
 */
function toJSON(value: any): any {
  // Skip null/undefined values
  if (!value) {
    return value;
  }
  
  // Skip Date objects (they have special handling)
  if (isDate(value)) {
    return value;
  }
  
  // Use object's custom toJSON method if available
  if (typeof value.toJSON === 'function') {
    return value.toJSON();
  }
  
  // Otherwise return unmodified
  return value;
}
