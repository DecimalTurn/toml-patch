import {
  KeyValue,
  Table,
  InlineTable,
  TableArray,
  InlineArray,
  isInlineTable,
  isInlineArray,
  isKeyValue,
  isInlineItem,
  isTable,
  isTableArray,
  Document,
  Block,
  TreeNode
} from './cst';
import { generateTable, generateDocument, generateTableArray } from './generate';
import { insert, remove, applyWrites, shiftNode } from './writer';
import { TomlFormat } from './toml-format';
import { getInlineContainerLayout, hasStructuralMultilineRows } from './inline-format';
import { getCommaSpace } from './inline-comma-space';

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
      // Fast path: empty inline tables don't need the full formatTable
      // machinery (inline table copy, insert loop, applyWrites).
      if ((node.value as InlineTable).items.length === 0) {
        insert(document, document, generateTable(node.key.value));
      } else {
        insert(document, document, formatTable(node, format.bracketSpacing));
      }
    } else {
      formatTableArray(node, format.bracketSpacing).forEach(table_array => {
        insert(document, document, table_array);
      });
    }
  });

  applyWrites(document);
  return document;
}

function formatTable(key_value: KeyValue, bracketSpacing: boolean): Table {
  const table = generateTable(key_value.key.value);

  for (const item of (key_value.value as InlineTable).items) {
    insert(table, table, item.item, undefined, undefined, undefined, undefined, true);
  }

  applyWrites(table);
  normalizeGeneratedInlineRows(table, 1, bracketSpacing);
  return table;
}

function formatTableArray(key_value: KeyValue, bracketSpacing: boolean): TableArray[] {
  const root = generateDocument();

  for (const inline_array_item of (key_value.value as InlineArray).items) {
    const table_array = generateTableArray(key_value.key.value);
    insert(root, root, table_array);

    for (const inline_table_item of (inline_array_item.item as InlineTable).items) {
      insert(root, table_array, inline_table_item.item, undefined, undefined, undefined, undefined, true);
    }
  }

  applyWrites(root);
  for (const item of root.items) {
    if (isTable(item) || isTableArray(item)) normalizeGeneratedInlineRows(item, 1, bracketSpacing);
  }
  return root.items as TableArray[];
}

/**
 * Whether an inline container lays its items out one per row. A container
 * regenerated through a TOML round-trip carries no layout flag, so fall back to
 * the physical rows: a row on a later line than the previous item's end means
 * multiline. A compact container whose items merely SPAN several lines (because
 * one of them is a multiline value) stays compact — its closing bracket still
 * follows its last item.
 */
function isMultilineInlineContainer(container: InlineArray | InlineTable): boolean {
  const layout = getInlineContainerLayout(container);
  return layout !== undefined ? layout : hasStructuralMultilineRows(container);
}

/**
 * Row indent for a container that is an array ELEMENT (no key of its own).
 * Keyless rows keep the historical minimum of two columns, matching
 * positionGeneratedNestedInlineTables so element rows and their closing
 * bracket stay aligned the same way no matter which path laid them out.
 */
function elementIndentWidth(indentWidth: number): number {
  return Math.max(indentWidth, 2);
}

/**
 * Lays out a generated inline container so that its rows and closing bracket
 * line up with the key (or, for an array element, the element) that owns it:
 *
 * - a multiline container puts one row per line at `anchorColumn + indentWidth`
 *   and its closing bracket at `anchorColumn`;
 * - a nested multiline container inside a row does the same, using that row's
 *   key column as its own anchor.
 *
 * `anchorColumn` is the column of the owning key's start. It only has to be
 * correct for containers the generator built: containers parsed from an
 * existing document keep their own formatting, so callers must restrict this
 * to freshly generated/replaced subtrees.
 *
 * Returns whether a nested container's end position moved.
 */
export function normalizeInlineContainerRows(
  container: InlineArray | InlineTable,
  anchorColumn: number,
  indentWidth: number,
  bracketSpacing = true
): boolean {
  const multiline = isMultilineInlineContainer(container);
  let nestedEndChanged = false;
  if (multiline) {
    const rowIndent = anchorColumn + indentWidth;
    for (const item of container.items) {
      shiftNode(item, { lines: 0, columns: rowIndent - item.loc.start.column });
      if (isInlineItem(item)) {
        if (isInlineArray(item.item) || isInlineTable(item.item)) {
          if (normalizeInlineContainerRows(item.item, item.item.loc.start.column, elementIndentWidth(indentWidth), bracketSpacing)) {
            item.loc.end = { ...item.item.loc.end };
            nestedEndChanged = true;
          }
        } else if (isKeyValue(item.item) &&
            (isInlineArray(item.item.value) || isInlineTable(item.item.value))) {
          // The nested container's rows hang off the ROW's key, so it has to
          // be laid out from the key's own column — not from the enclosing
          // container's indent (fuzz3 seed 18515).
          if (normalizeInlineContainerRows(item.item.value, item.item.loc.start.column, indentWidth, bracketSpacing)) {
            item.item.loc.end = { ...item.item.value.loc.end };
            item.loc.end = { ...item.item.loc.end };
            nestedEndChanged = true;
          }
        }
      }
    }
    container.loc.end.column = anchorColumn + 1;
    // The container's own closing bracket moved, so the enclosing item has to
    // re-sync its end from it (its comma is written at that end).
    nestedEndChanged = true;
  }

  for (const item of container.items) {
    if (!isInlineItem(item)) continue;
    if (isInlineArray(item.item) || isInlineTable(item.item)) {
      if (normalizeInlineContainerRows(item.item, item.item.loc.start.column, elementIndentWidth(indentWidth), bracketSpacing)) {
        item.loc.end = { ...item.item.loc.end };
        nestedEndChanged = true;
      }
    } else if (isKeyValue(item.item) &&
        (isInlineArray(item.item.value) || isInlineTable(item.item.value))) {
      const value = item.item.value;
      const anchorColumn = item.item.loc.start.column;
      const valueMultiline = isMultilineInlineContainer(value);
      if (normalizeInlineContainerRows(value, anchorColumn, indentWidth, bracketSpacing)) {
        // A MULTILINE nested value closes on its own row, level with the row's
        // key. A compact one closes right after its last item — that end was
        // already computed by its own pass, so snapping it to the key column
        // would place the closing bracket before the item it follows
        // (fuzz3 seed 14739).
        if (valueMultiline) value.loc.end.column = anchorColumn + 1;
        item.item.loc.end = { ...value.loc.end };
        item.loc.end = { ...item.item.loc.end };
        nestedEndChanged = true;
      }
    }
  }
  // A nested container that grew pushes its following siblings along: the
  // siblings were positioned against its OLD end, so the ones still sharing its
  // end row must be re-anchored to its new end before the container's own
  // closing bracket is placed from the last item.
  const commaSpace = getCommaSpace(container) ?? 2;
  for (let index = 1; index < container.items.length; index++) {
    const previous = container.items[index - 1];
    const next = container.items[index];
    if (previous.loc.end.line !== next.loc.start.line) continue;
    const targetColumn = previous.loc.end.column + (previous.comma ? commaSpace : 1);
    shiftNode(next, { lines: 0, columns: targetColumn - next.loc.start.column });
  }
  if (nestedEndChanged && !multiline && container.items.length > 0) {
    const lastItem = container.items[container.items.length - 1];
    container.loc.end = {
      line: lastItem.loc.end.line,
      column: lastItem.loc.end.column + (lastItem.comma ? 1 : 0) + (bracketSpacing ? 2 : 1)
    };
  }
  return nestedEndChanged;
}

export function normalizeGeneratedInlineRows(
  block: Table | TableArray | KeyValue,
  indentWidth: number,
  bracketSpacing = true
): void {
  // A root-level key-value is normalized like the rows of a table: its own key
  // column is the anchor the nested container hangs off.
  const rows: Block[] = isKeyValue(block) ? [block] : block.items;
  for (const item of rows) {
    if (!isKeyValue(item)) continue;
    if (isInlineArray(item.value) || isInlineTable(item.value)) {
      normalizeInlineContainerRows(item.value, item.loc.start.column, indentWidth, bracketSpacing);
    }
  }
}

export function normalizeGeneratedInlineContainerRows(
  container: InlineArray | InlineTable,
  indentWidth: number
): void {
  const normalize = (
    current: InlineArray | InlineTable,
    normalizeCurrent: boolean
  ): void => {
    if (normalizeCurrent) {
      delete (current as { range?: [number, number] }).range;
      const multiline = getInlineContainerLayout(current) === true ||
        hasStructuralMultilineRows(current);
      if (multiline) {
        const rowIndent = current.loc.start.column + indentWidth;
        for (const item of current.items) {
          shiftNode(item, { lines: 0, columns: rowIndent - item.loc.start.column });
        }
        current.loc.end.column = current.loc.start.column + 1;
      }
    }

    for (const item of current.items) {
      if (!isInlineItem(item)) continue;
      if (isInlineArray(item.item) || isInlineTable(item.item)) {
        normalize(item.item, isInlineArray(current) && isInlineTable(item.item));
      } else if (isKeyValue(item.item) &&
          (isInlineArray(item.item.value) || isInlineTable(item.item.value))) {
        normalize(item.item.value, false);
      }
    }
  };

  normalize(container, false);
}

/**
 * Updates a table's location end position after removing inline table items.
 * When inline table content is removed from a parent table, the parent table's 
 * end position needs to be adjusted to reflect where the content actually ends.
 * 
 * @param table - The table whose end position should be updated
 */
export function postInlineItemRemovalAdjustment(table: Table | TableArray): void {
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

  const additionalTables: { table: Table; parent: Table | TableArray }[] = [];
  
  // Process all existing tables for nested inline tables
  for (const item of document.items) {
    if (isKeyValue(item) && isInlineTable(item.value)) {
      // This is a top-level inline table (depth 0)
      const depth = calculateTableDepth(item.key.value);
      if (depth < format.inlineTableStart) {
        // Convert to a separate table
        const table = formatTable(item, format.bracketSpacing);
        remove(document, document, item);
        insert(document, document, table);
        
        processTableForNestedInlines(table, additionalTables, format);
      }
    } else if (item.type === 'Table') {
      processTableForNestedInlines(item as Table, additionalTables, format);
    } else if (isTableArray(item)) {
      processTableForNestedInlines(item, additionalTables, format);
    }
  }
  
  // Insert each extracted table immediately after its parent block, preserving
  // the parent-child positional relationship.  A flat append at the document
  // end (the previous behaviour) misplaced a sub-table of an earlier entry —
  // e.g. `[tp6.k41]` (a sub-table of `[[tp6]]` entry 0) landed after `[[tp6]]`
  // entry 1, reassigning `k41` to the wrong entry.  `additionalTables` is in
  // depth-first pre-order (a child is pushed before its own children), so
  // inserting in order with a per-parent counter keeps every sub-table after
  // its parent and before the parent's next sibling.
  const insertedAfter = new Map<Table | TableArray, number>();
  for (const { table, parent } of additionalTables) {
    const index = document.items.indexOf(parent);
    const offset = (insertedAfter.get(parent) ?? 0) + 1;
    insertedAfter.set(parent, offset);
    insert(document, document, table, index + offset);
  }

  applyWrites(document);
  return document;
}

/**
 * Recursively processes a table for nested inline tables and extracts them as separate tables
 * when they are at a depth less than the inlineTableStart threshold.
 */
function processTableForNestedInlines(table: Table | TableArray, additionalTables: { table: Table; parent: Table | TableArray }[], format: TomlFormat): void {
  // Collect all inline tables that need extraction, then process in forward order
  // to preserve the original key order in the output.
  const toExtract: { item: KeyValue; nestedTableKey: string[] }[] = [];
  for (let i = 0; i < table.items.length; i++) {
    const item = table.items[i];
    if (isKeyValue(item) && isInlineTable(item.value)) {
      const nestedTableKey = [...table.key.item.value, ...item.key.value];
      const depth = calculateTableDepth(nestedTableKey);
      if (depth < (format.inlineTableStart ?? 1)) {
        toExtract.push({ item, nestedTableKey });
      }
    }
  }

  // Process in forward order.  Each item reference captured above is stable
  // even after previous iterations call remove() — the KeyValue node itself
  // stays valid regardless of index shifts.
  for (const { item, nestedTableKey } of toExtract) {
    const separateTable = generateTable(nestedTableKey);
    const inlineTable = item.value as InlineTable;

    for (const inlineItem of inlineTable.items) {
      insert(separateTable, separateTable, inlineItem.item);
    }
    // Finalize the separateTable's internal offsets and recalculate its span
    // so it can be safely inserted into the document later.
    applyWrites(separateTable);

    remove(table, table, item);
    postInlineItemRemovalAdjustment(table);

    additionalTables.push({ table: separateTable, parent: table });

    processTableForNestedInlines(separateTable, additionalTables, format);
  }
  // Apply removal offsets accumulated on this table so remaining items
  // (if any) are shifted to the correct positions.
  if (toExtract.length > 0) {
    applyWrites(table);
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
