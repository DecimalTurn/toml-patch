import { Value, KeyValue, Document, InlineArray, InlineTable } from './cst';
import {
  generateDocument,
  generateKeyValue,
  generateInlineItem,
  generateString,
  generateInteger,
  generateFloat,
  generateBoolean,
  generateDateTime,
  generateTemporalDateTime,
  generateInlineArray,
  generateInlineTable
} from './generate';
import { TomlFormat } from './toml-format';
import { formatTopLevel, formatEmptyLines, formatNestedTablesMultiline, normalizeGeneratedInlineRows } from './formatter';
import { isObject, isString, isBigInt, isInteger, isFloat, isBoolean, isDate, isTemporal } from './utils';
import { insert, applyWrites, applyBracketSpacing, applyTrailingComma, markStringifyRoot, setRootIndentWidth } from './writer';
import { prepareInsertedNestedInlineContainer } from './inline-layout';
import { getInlineContainerLayout, markInlineContainerPositioned, resolveInlineContainerLayout, setInlineContainerLayout } from './inline-format';

/**
 * Parses a JavaScript object into a CST Document, applying formatting options from TomlFormat.
 * @param value - The JavaScript object to parse.
 * @param format - The formatting options to apply.
 * @returns The resulting CST Document.
 */
export default function parseJS(
  value: any,
  format: TomlFormat = TomlFormat.default(),
  depth = 0,
  parentIsMultiline = false
): Document {
  value = toJSON(value);

  const document = generateDocument();
  // Enable stringify fast paths in the writer — no comments, no removals.
  markStringifyRoot(document);
  setRootIndentWidth(document, format.indentWidth);
  for (const item of walkObject(value, format, depth, parentIsMultiline)) {
    insert(document, document, item);
  }
  applyWrites(document);

  // Heuristics:
  // 1. Top-level objects/arrays should be tables/table arrays
  // 2. Convert nested inline tables to separate tables based on preferNestedTablesMultiline
  formatTopLevel(document, format);
  formatNestedTablesMultiline(document, format);
  for (const item of document.items) {
    if (item.type === 'Table' || item.type === 'TableArray') {
      normalizeGeneratedInlineRows(item, format.indentWidth);
    }
  }

  return formatEmptyLines(document);
}

function* walkObject(
  object: any,
  format: TomlFormat,
  depth = 0,
  parentIsMultiline = false
): IterableIterator<KeyValue> {
  for (const key of Object.keys(object)) {
    const rawValue = object[key];
    if (rawValue === undefined) continue;
    const value = toJSON(rawValue);
    if (value === undefined) continue;
    yield generateKeyValue(
      [key],
      walkValue(value, format, depth, parentIsMultiline),
      depth > 0 && !parentIsMultiline
    );
  }
}

function walkValue(
  value: any,
  format: TomlFormat,
  depth: number,
  parentIsMultiline: boolean
): Value {
  const minimumDecimals = format.minimumDecimals ?? 0;

  if (value === null) {
    throw new Error('"null" values are not supported');
  }
  if (value === undefined) {
    throw new Error('"undefined" values are not supported inside arrays');
  }

  if (isString(value)) {
    return generateString(value);
  } else if (isBigInt(value)) {
    return generateInteger(value);
  } else if (isInteger(value)) {
    return minimumDecimals > 0 ? generateFloat(value, minimumDecimals) : generateInteger(value);
  } else if (isFloat(value)) {
    return generateFloat(value, Math.max(minimumDecimals, 1));
  } else if (isBoolean(value)) {
    return generateBoolean(value);
  } else if (isTemporal(value)) {
    return generateTemporalDateTime(value, format.truncateZeroTimeInDates);
  } else if (isDate(value)) {
    return generateDateTime(value, format.truncateZeroTimeInDates);
  } else if (Array.isArray(value)) {
    return walkInlineArray(value, format, depth, parentIsMultiline);
  } else {
    return walkInlineTable(value, format, depth, parentIsMultiline);
  }
}

function walkInlineArray(
  value: Array<any>,
  format: TomlFormat,
  depth: number,
  parentIsMultiline: boolean
): InlineArray {
  const inline_array = generateInlineArray();
  const multiline = resolveInlineContainerLayout('array', depth, parentIsMultiline, format);
  setInlineContainerLayout(inline_array, multiline);
  setRootIndentWidth(inline_array, format.indentWidth);
  for (const element of value) {
    const item = walkValue(element, format, depth + 1, multiline);
    const inline_array_item = generateInlineItem(item);

    if (!multiline && (item.type === 'InlineArray' || item.type === 'InlineTable') &&
        getInlineContainerLayout(item) === true) {
      markInlineContainerPositioned(item);
    }
    prepareInsertedNestedInlineContainer(inline_array, inline_array_item, format.indentWidth);
    insert(inline_array, inline_array, inline_array_item);
  }
  applyBracketSpacing(inline_array, inline_array, format.bracketSpacing);
  applyTrailingComma(inline_array, inline_array, format.trailingComma);
  applyWrites(inline_array);

  return inline_array;
}

function walkInlineTable(
  value: object,
  format: TomlFormat,
  depth: number,
  parentIsMultiline: boolean
): InlineTable | Value {
  value = toJSON(value);
  if (!isObject(value)) return walkValue(value, format, depth, parentIsMultiline);

  const inline_table = generateInlineTable();
  const multiline = resolveInlineContainerLayout('table', depth, parentIsMultiline, format);
  setInlineContainerLayout(inline_table, multiline);
  setRootIndentWidth(inline_table, format.indentWidth);
  for (const item of walkObject(value, format, depth + 1, multiline)) {
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

  // Skip Temporal objects (they represent themselves, don't call toJSON())
  if (isTemporal(value)) {
    return value;
  }
  
  // Use object's custom toJSON method if available
  if (typeof value.toJSON === 'function') {
    return value.toJSON();
  }
  
  // Otherwise return unmodified
  return value;
}
