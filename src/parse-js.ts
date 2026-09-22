import { Value, KeyValue, Document, InlineArray, InlineTable, InlineItem, isKeyValue, isInlineArray, isInlineTable } from './cst';
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
import { insert, applyWrites, applyBracketSpacing, applyTrailingComma, markStringifyRoot, setRootIndentWidth, shiftNode } from './writer';
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

  // `formatNestedTablesMultiline` only extracts tables when inlineTableStart > 1
  // (depth-0 tables were already handled by formatTopLevel), and
  // `normalizeGeneratedInlineRows` only moves rows when a multiline container
  // was generated. Skip both full-tree passes when the format cannot trigger
  // them, which is the common default-format case.
  if ((format.inlineTableStart ?? 1) > 1) {
    formatNestedTablesMultiline(document, format);
  }
  if (format.multilineTable !== 'auto' || format.multilineArray !== 'auto') {
    for (const item of document.items) {
      if (item.type === 'Table' || item.type === 'TableArray') {
        normalizeGeneratedInlineRows(item, format.indentWidth, format.bracketSpacing);
      } else if (isKeyValue(item) && (isInlineArray(item.value) || isInlineTable(item.value))) {
        // Root key-values stay key-values when `inlineTableStart` is 0, so they
        // never reach formatTopLevel/formatNestedTablesMultiline. Their nested
        // multiline containers still need the same row/key alignment as the rows
        // of a converted table (fuzz3 seed 18515).
        normalizeGeneratedInlineRows(item, format.indentWidth, format.bracketSpacing);
      }
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

function appendCompactInlineItem(
  parent: InlineArray | InlineTable,
  child: InlineItem,
  format: TomlFormat
): void {
  const previous = parent.items[parent.items.length - 1];
  if (previous) previous.comma = true;

  const start = previous
    ? {
        line: previous.loc.end.line,
        column: previous.loc.end.column + 2
      }
    : {
        line: parent.loc.start.line,
        column: parent.loc.start.column + (format.bracketSpacing ? 2 : 1)
      };

  shiftNode(child, {
    lines: start.line - child.loc.start.line,
    columns: start.column - child.loc.start.column
  });
  (parent.items as InlineItem[]).push(child);

  child.comma = false;
  parent.loc.end = {
    line: child.loc.end.line,
    column: child.loc.end.column + (format.bracketSpacing ? 2 : 1)
  };
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
  const multiline = !(value.length === 0 && depth > 0) &&
    resolveInlineContainerLayout('array', depth, parentIsMultiline, format);
  setInlineContainerLayout(inline_array, multiline);
  setRootIndentWidth(inline_array, format.indentWidth);
  markStringifyRoot(inline_array);
  if (!multiline) {
    for (const element of value) {
      const item = walkValue(element, format, depth + 1, multiline);
      const inline_array_item = generateInlineItem(item);

      if ((item.type === 'InlineArray' || item.type === 'InlineTable') &&
          getInlineContainerLayout(item) === true) {
        markInlineContainerPositioned(item);
      }
      appendCompactInlineItem(inline_array, inline_array_item, format);
    }
    if (inline_array.items.length > 0 && format.trailingComma) {
      const last = inline_array.items[inline_array.items.length - 1];
      last.comma = true;
      inline_array.loc.end.column++;
    }
    return inline_array;
  }
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
  const multiline = !(Object.keys(value).length === 0 && depth > 0) &&
    resolveInlineContainerLayout('table', depth, parentIsMultiline, format);
  setInlineContainerLayout(inline_table, multiline);
  setRootIndentWidth(inline_table, format.indentWidth);
  markStringifyRoot(inline_table);
  if (!multiline) {
    for (const item of walkObject(value, format, depth + 1, multiline)) {
      appendCompactInlineItem(inline_table, generateInlineItem(item), format);
    }
    if (inline_table.items.length > 0 && format.trailingComma) {
      const last = inline_table.items[inline_table.items.length - 1];
      last.comma = true;
      inline_table.loc.end.column++;
    }
    return inline_table;
  }
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
