import {
  KeyValue,
  Table,
  InlineTable,
  TableArray,
  InlineArray,
  isInlineTable,
  isInlineArray,
  isKeyValue,
  Document,
  TreeNode
} from './ast';
import { generateTable, generateDocument, generateTableArray } from './generate';
import { insert, remove, applyWrites, shiftNode } from './writer';
import { TomlFormat } from './toml-format';

// Helper function to detect if an InlineArray originally had trailing commas
export function arrayHadTrailingCommas(node: TreeNode): boolean {
  if (!isInlineArray(node)) return false;
  if (node.items.length === 0) return false;
  // Check if the last item has a trailing comma
  const lastItem = node.items[node.items.length - 1];
  return lastItem.comma === true;
}

// Helper function to detect if an InlineTable originally had trailing commas
export function tableHadTrailingCommas(node: TreeNode): boolean {
  if (!isInlineTable(node)) return false;
  if (node.items.length === 0) return false;
  // Check if the last item has a trailing comma
  const lastItem = node.items[node.items.length - 1];
  return lastItem.comma === true;
}

export function formatTopLevel(document: Document, format: TomlFormat): Document {

  // If inlineTableStart is 0, convert all top-level tables to inline tables
  if (format.inlineTableStart === 0) {
    return document;
  }

  const move_to_top_level = document.items.filter(item => {
    if (!isKeyValue(item)) return false;

    const is_inline_table = isInlineTable(item.value);
    const is_inline_array =
      isInlineArray(item.value) &&
      item.value.items.length > 0 &&
      item.value.items.every(i => isInlineTable(i.item));

    // Only move to top level if the depth is less than inlineTableStart
    if (is_inline_table || is_inline_array) {
      const depth = calculateTableDepth(item.key.value);
      return format.inlineTableStart === undefined || depth < format.inlineTableStart;
    }

    return false;
  }) as KeyValue[];

  move_to_top_level.forEach(node => {
    remove(document, document, node);

    if (isInlineTable(node.value)) {
      insert(document, document, formatTable(node));
    } else {
      formatTableArray(node).forEach(table_array => {
        insert(document, document, table_array);
      });
    }
  });

  applyWrites(document);
  return document;
}

function formatTable(key_value: KeyValue): Table {
  const table = generateTable(key_value.key.value);

  for (const item of (key_value.value as InlineTable).items) {
    insert(table, table, item.item);
  }

  applyWrites(table);
  return table;
}

function formatTableArray(key_value: KeyValue): TableArray[] {
  const root = generateDocument();

  for (const inline_array_item of (key_value.value as InlineArray).items) {
    const table_array = generateTableArray(key_value.key.value);
    insert(root, root, table_array);

    for (const inline_table_item of (inline_array_item.item as InlineTable).items) {
      insert(root, table_array, inline_table_item.item);
    }
  }

  applyWrites(root);
  return root.items as TableArray[];
}

/**
 * Updates a table's location end position after removing inline table items.
 * When inline table content is removed from a parent table, the parent table's 
 * end position needs to be adjusted to reflect where the content actually ends.
 * 
 * @param table - The table whose end position should be updated
 */
export function postInlineItemRemovalAdjustment(table: Table): void {
  if (table.items.length > 0) {
    const lastItem = table.items[table.items.length - 1];
    table.loc.end.line = lastItem.loc.end.line;
    table.loc.end.column = lastItem.loc.end.column;
  } else {
    // If no items left, table ends at the header line
    table.loc.end.line = table.key.loc.end.line;
    table.loc.end.column = table.key.loc.end.column;
  }
}

/**
 * Calculates the nesting depth of a table based on its key path.
 * Root level tables (e.g., [table]) have depth 0.
 * First level nested tables (e.g., [table.nested]) have depth 1.
 * 
 * @param keyPath - Array representing the table key path (e.g., ['table', 'nested'])
 * @returns The nesting depth (0 for root level, 1+ for nested levels)
 */
export function calculateTableDepth(keyPath: string[]): number {
  return Math.max(0, keyPath.length - 1);
}

/**
 * Converts nested inline tables to separate table sections based on the inlineTableStart depth setting.
 * This function recursively processes all tables in the document and extracts inline tables that are
 * at a depth less than the inlineTableStart threshold.
 */
export function formatNestedTablesMultiline(document: Document, format: TomlFormat): Document {
  // If inlineTableStart is undefined, use the default behavior (no conversion)
  // If inlineTableStart is 0, all should be inline (no conversion)
  if (format.inlineTableStart === undefined || format.inlineTableStart === 0) {
    return document;
  }

  const additionalTables: Table[] = [];
  
  // Process all existing tables for nested inline tables
  for (const item of document.items) {
    if (isKeyValue(item) && isInlineTable(item.value)) {
      // This is a top-level inline table (depth 0)
      const depth = calculateTableDepth(item.key.value);
      if (depth < format.inlineTableStart) {
        // Convert to a separate table
        const table = formatTable(item);
        
        // Remove the original inline table item
        remove(document, document, item);
        
        // Add the new table
        insert(document, document, table);
        
        // Process this table for further nested inlines
        processTableForNestedInlines(table, additionalTables, format);
      }
    } else if (item.type === 'Table') {
      // Process existing table for nested inline tables
      processTableForNestedInlines(item as Table, additionalTables, format);
    }
  }
  
  // Add all the additional tables to the document
  for (const table of additionalTables) {
    insert(document, document, table);
  }

  applyWrites(document);
  return document;
}

/**
 * Recursively processes a table for nested inline tables and extracts them as separate tables
 * when they are at a depth less than the inlineTableStart threshold.
 */
function processTableForNestedInlines(table: Table, additionalTables: Table[], format: TomlFormat): void {
  // Process from end to beginning to avoid index issues when removing items
  for (let i = table.items.length - 1; i >= 0; i--) {
    const item = table.items[i];
    if (isKeyValue(item) && isInlineTable(item.value)) {
      // Calculate the depth of this nested table
      const nestedTableKey = [...table.key.item.value, ...item.key.value];
      const depth = calculateTableDepth(nestedTableKey);
      
      // Only convert to separate table if depth is less than inlineTableStart
      if (depth < (format.inlineTableStart ?? 1)) {
        // Convert this inline table to a separate table section
        const separateTable = generateTable(nestedTableKey);
        
        // Move all items from the inline table to the separate table
        for (const inlineItem of item.value.items) {
          insert(separateTable, separateTable, inlineItem.item);
        }
        
        // Remove this item from the original table
        remove(table, table, item);
        
        // Update the parent table's end position after removal
        postInlineItemRemovalAdjustment(table);
        
        // Add this table to be inserted into the document
        additionalTables.push(separateTable);
        
        // Recursively process the new table for further nested inlines
        processTableForNestedInlines(separateTable, additionalTables, format);
      }
    }
  }
}

export function formatEmptyLines(document: Document): Document {
  let shift = 0;
  let previous = 0;
  for (const item of document.items) {
    if (previous === 0 && item.loc.start.line > 1) {
      // Remove leading newlines
      shift = 1 - item.loc.start.line;
    } else if (item.loc.start.line + shift > previous + 2) {
      shift += previous + 2 - (item.loc.start.line + shift);
    }

    shiftNode(item, {
      lines: shift,
      columns: 0
    });
    previous = item.loc.end.line;
  }

  return document;
}
