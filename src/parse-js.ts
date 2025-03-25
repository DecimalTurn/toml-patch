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
import { Format, formatTopLevel, formatPrintWidth, formatEmptyLines } from './format';
import { isObject, isString, isInteger, isFloat, isBoolean, isDate, pipe } from './utils';
import { insert, applyWrites, applyBracketSpacing, applyTrailingComma } from './writer';

const default_format = {
  printWidth: 80,
  trailingComma: false,
  bracketSpacing: true
};

export default function parseJS(value: any, format: Format = {}): Document {
  format = Object.assign({}, default_format, format);
  value = toJSON(value);

  // Reorder the elements in the object
  value = reorderElements(value);

  const document = generateDocument();
  for (const item of walkObject(value, format)) {
    insert(document, document, item);
  }
  applyWrites(document);

  // Heuristics:
  // 1. Top-level objects/arrays should be tables/table arrays
  // 2. Convert objects/arrays to tables/table arrays based on print width
  const formatted = pipe(
    document,
    formatTopLevel,
    document => formatPrintWidth(document, format),
    formatEmptyLines
  );

  return formatted;
}

/** 
This function makes sure that properties that are simple values (not objects or arrays) are ordered first,
and that objects and arrays are ordered last. This makes parseJS more reliable and easier to test.
*/
function reorderElements(value:any) : Object {
  let result: Record<string, any> = {};
  
  // First add all simple values
  for (const key in value) {
    if (!isObject(value[key]) && !Array.isArray(value[key])) {
      result[key] = value[key];
    }
  }
  
  // Then add all objects and arrays
  for (const key in value) {
    if (isObject(value[key]) || Array.isArray(value[key])) {
      result[key] = value[key];
    }
  }
  
  return result;
}

function* walkObject(object: any, format: Format): IterableIterator<KeyValue> {
  for (const key of Object.keys(object)) {
    yield generateKeyValue([key], walkValue(object[key], format));
  }
}

function walkValue(value: any, format: Format): Value {
  if (value == null) {
    throw new Error('"null" and "undefined" values are not supported');
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
    return generateDateTime(value);
  } else if (Array.isArray(value)) {
    return walkInlineArray(value, format);
  } else {
    return walkInlineTable(value, format);
  }
}

function walkInlineArray(value: Array<any>, format: Format): InlineArray {
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

function walkInlineTable(value: object, format: Format): InlineTable | Value {
  value = toJSON(value);
  if (!isObject(value)) return walkValue(value, format);

  const inline_table = generateInlineTable();
  const items = [...walkObject(value, format)];
  for (const item of items) {
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
