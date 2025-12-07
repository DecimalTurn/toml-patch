import parseTOML from './parse-toml';
import parseJS from './parse-js';
import toJS from './to-js';
import toTOML from './to-toml';
import { TomlFormat } from './toml-format';
import {
  isKeyValue,
  WithItems,
  KeyValue,
  isTable,
  TreeNode,
  Document,
  isDocument,
  Block,
  NodeType,
  isTableArray,
  isInlineArray,
  isInlineTable,
  isInlineItem,
  hasItem,
  InlineItem,
  AST
} from './ast';
import diff, { Change, isAdd, isEdit, isRemove, isMove, isRename } from './diff';
import findByPath, { tryFindByPath, findParent } from './find-by-path';
import { last, isInteger } from './utils';
import { insert, replace, remove, applyWrites } from './writer';
import { generateInlineItem, generateTable } from './generate';
import { validate } from './validate';
import { arrayHadTrailingCommas, tableHadTrailingCommas, resolveTomlFormat, postInlineItemRemovalAdjustment, calculateTableDepth } from './toml-format';

export function toDocument(ast: AST) : Document  {
  const items = [...ast];
  return  {
    type: NodeType.Document,
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    items
  };
}

/**
 * Applies modifications to a TOML document by comparing an existing TOML string with updated JavaScript data.
 * 
 * This function preserves formatting and comments from the existing TOML document while
 * applying changes from the updated data structure. It performs a diff between the existing
 * and updated data, then strategically applies only the necessary changes to maintain the
 * original document structure as much as possible.
 * 
 * @param existing - The original TOML document as a string
 * @param updated - The updated JavaScript object with desired changes
 * @param format - Optional formatting options to apply to new or modified sections
 * @returns A new TOML string with the changes applied
 */
export default function patch(existing: string, updated: any, format?: Partial<TomlFormat> | TomlFormat): string {
  const existing_ast = parseTOML(existing);

  // Auto-detect formatting preferences from the existing TOML string for fallback
  const autoDetectedFormat = TomlFormat.autoDetectFormat(existing);
  const fmt = resolveTomlFormat(format, autoDetectedFormat);

  return patchAst(existing_ast, updated, fmt).tomlString;
}

export function patchAst(existing_ast:AST, updated: any, format: TomlFormat): { tomlString: string; document: Document } {
  const items = [...existing_ast];

  const existing_js = toJS(items);
  const existing_document: Document = {
    type: NodeType.Document,
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    items
  };

  // Certain formatting options should not be applied to the updated document during patching, because it would
  // override the existing formatting too aggressively. For example, preferNestedTablesMultiline would
  // convert all nested tables to multiline, which is not be desired during patching.
  // Therefore, we create a modified format for generating the updated document used for diffing.
  const diffing_fmt = resolveTomlFormat({...format, inlineTableStart: undefined}, format);
  const updated_document = parseJS(updated, diffing_fmt);
  
  const changes = reorder(diff(existing_js, updated));

  if (changes.length === 0) {
    return {
      tomlString: toTOML(items, format),
      document: existing_document
    };
  }

  const patched_document = applyChanges(existing_document, updated_document, changes, format);

  // Validate the patched_document
  // This would prevent overlapping element positions in the AST, but since those are handled at stringification time, we can skip this for now
  //validate(patched_document);

  return {
    tomlString: toTOML(patched_document.items, format),
    document: patched_document
  };
}

function reorder(changes: Change[]): Change[] {
  //Reorder deletions among themselves to avoid index issues
  // We want the path to be looking at the last item in the array first and go down from there
 
  let sorted = false;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if (isRemove(change)) {
      let j = i + 1;
      while (j < changes.length) {
        const next_change = changes[j];
        if (isRemove(next_change) && next_change.path[0] === change.path[0]  && 
            next_change.path[1] > change.path[1]) {
          changes.splice(j, 1);
          changes.splice(i, 0, next_change);
          // We reset i to the beginning of the loop to avoid skipping any changes
          i = 0
          break;
        }
        j++;
      }
    }
  }
  
  return changes;

}

/**
 * Applies a list of changes to the original TOML document AST while preserving formatting and structure.
 * 
 * This function processes different types of changes (Add, Edit, Remove, Move, Rename) and applies them
 * to the original document in a way that maintains the existing formatting preferences, comments, and
 * structural elements as much as possible. Special handling is provided for different node types like
 * inline tables, arrays, and table arrays to ensure proper formatting consistency.
 * 
 * @param original - The original TOML document AST to be modified
 * @param updated - The updated document AST containing new values for changes
 * @param changes - Array of change objects describing what modifications to apply
 * @param format - Formatting preferences to use for newly added elements
 * @returns The modified original document with all changes applied
 * 
 * @example
 * ```typescript
 * const changes = [
 *   { type: 'add', path: ['newKey'], value: 'newValue' },
 *   { type: 'edit', path: ['existingKey'], value: 'updatedValue' }
 * ];
 * const result = applyChanges(originalDoc, updatedDoc, changes, format);
 * ```
 */
function applyChanges(original: Document, updated: Document, changes: Change[], format: TomlFormat): Document {
  // Potential Changes:
  //
  // Add: Add key-value to object, add item to array
  // Edit: Change in value
  // Remove: Remove key-value from object, remove item from array
  // Move: Move item in array
  // Rename: Rename key in key-value
  //
  // Special consideration, inline comments need to move as-needed

  changes.forEach(change => {
    if (isAdd(change)) {

      const child = findByPath(updated, change.path);
      const parent_path = change.path.slice(0, -1);
      let index = last(change.path)! as number;

      let is_table_array = isTableArray(child);
      if (isInteger(index) && !parent_path.some(isInteger)) {
        const sibling = tryFindByPath(original, parent_path.concat(0));
        if (sibling && isTableArray(sibling)) {
          is_table_array = true;
        }
      }

      // Determine the parent node where the new child will be inserted
      let parent: TreeNode;
      if (isTable(child)) {
        parent = original;
      } else if (is_table_array) {
        parent = original;

        // The index needs to be updated to top-level items
        // to properly account for other items, comments, and nesting
        const document = original as Document;
        const before = tryFindByPath(document, parent_path.concat(index - 1)) as Block | undefined;
        const after = tryFindByPath(document, parent_path.concat(index)) as Block | undefined;
        if (after) {
          index = document.items.indexOf(after);
        } else if (before) {
          index = document.items.indexOf(before) + 1;
        } else {
          index = document.items.length;
        }
      } else {
        parent = findParent(original, change.path);
        if (isKeyValue(parent)) {
          parent = parent.value;
        }
      }

      if (isTableArray(parent) || isInlineArray(parent) || isDocument(parent)) {
        // Special handling for InlineArray: preserve original trailing comma format
        if (isInlineArray(parent)) {
          const originalHadTrailingCommas = arrayHadTrailingCommas(parent);
          // If this is an InlineItem being added to an array, check its comma setting
          if (isInlineItem(child)) {
            // The child comes from the updated document with global format applied
            // Override with the original array's format
            child.comma = originalHadTrailingCommas;
          }
        }
        
        // Check if we should convert nested inline tables to multiline tables
        if (format.inlineTableStart !== undefined && format.inlineTableStart > 0 && isDocument(parent) && isTable(child)) {
          const additionalTables = convertNestedInlineTablesToMultiline(child, original, format);
          
          // Insert the main table first
          insert(original, parent, child, index);
          
          // Then insert all the additional tables
          for (const table of additionalTables) {
            insert(original, original, table, undefined);
          }
        } else {
          insert(original, parent, child, index);
        }
      } else if (isInlineTable(parent)) {
        // Special handling for adding KeyValue to InlineTable
        // Preserve original trailing comma format
        const originalHadTrailingCommas = tableHadTrailingCommas(parent);
        // InlineTable items must be wrapped in InlineItem
        if (isKeyValue(child)) {
          const inlineItem = generateInlineItem(child);
          // Override with the original table's format
          inlineItem.comma = originalHadTrailingCommas;
          insert(original, parent, inlineItem);
        } else {
          insert(original, parent, child);
        }
      } else {
        // Check if we should convert inline tables to multiline tables when adding to existing tables
        if (format.inlineTableStart !== undefined && format.inlineTableStart > 0 && isKeyValue(child) && isInlineTable(child.value) && isTable(parent)) {
          // Calculate the depth of the inline table that would be created
          const baseTableKey = parent.key.item.value;
          const nestedTableKey = [...baseTableKey, ...child.key.value];
          const depth = calculateTableDepth(nestedTableKey);
          
          // Convert to separate section only if depth is less than inlineTableStart
          if (depth < format.inlineTableStart) {
            convertInlineTableToSeparateSection(child, parent, original, format);
          } else {
            insert(original, parent, child);
          }
        } else {
          insert(original, parent, child);
        }
      }

    } else if (isEdit(change)) {
      let existing = findByPath(original, change.path);
      let replacement = findByPath(updated, change.path);
      let parent;

      if (isKeyValue(existing) && isKeyValue(replacement)) {
        // Edit for key-value means value changes

        // Special handling for arrays: preserve original trailing comma format
        if (isInlineArray(existing.value) && isInlineArray(replacement.value)) {
          const originalHadTrailingCommas = arrayHadTrailingCommas(existing.value);
          const newArray = replacement.value;
          
          // Apply or remove trailing comma based on original format
          if (newArray.items.length > 0) {
            const lastItem = newArray.items[newArray.items.length - 1];
            lastItem.comma = originalHadTrailingCommas;
          }
        }
        
        // Special handling for inline tables: preserve original trailing comma format
        if (isInlineTable(existing.value) && isInlineTable(replacement.value)) {
          const originalHadTrailingCommas = tableHadTrailingCommas(existing.value);
          const newTable = replacement.value;
          
          // Apply or remove trailing comma based on original format
          if (newTable.items.length > 0) {
            const lastItem = newTable.items[newTable.items.length - 1];
            lastItem.comma = originalHadTrailingCommas;
          }
        }
        
        parent = existing;
        existing = existing.value;
        replacement = replacement.value;
      } else if (isKeyValue(existing) && isInlineItem(replacement) && isKeyValue(replacement.item)) {
        // Sometimes, the replacement looks like it could be an inline item, but the original is a key-value
        // In this case, we convert the replacement to a key-value to match the original
        parent = existing;
        existing = existing.value;
        replacement = replacement.item.value;
      } else if (isInlineItem(existing) && isKeyValue(replacement)) {
        // Editing inline table item: existing is InlineItem, replacement is KeyValue
        // We need to replace the KeyValue inside the InlineItem, preserving the InlineItem wrapper
        parent = existing;
        existing = existing.item;
      } else {
        parent = findParent(original, change.path);
        // Special handling for array element edits
        if (isKeyValue(parent)) {
          // Check if we're actually editing an array element
          const parentPath = change.path.slice(0, -1);
          const arrayNode = findByPath(original, parentPath);
          if (isKeyValue(arrayNode) && isInlineArray(arrayNode.value)) {
            parent = arrayNode.value;
          }
        }
      }

      replace(original, parent, existing, replacement);
    } else if (isRemove(change)) {
      let parent = findParent(original, change.path);
      if (isKeyValue(parent)) parent = parent.value;

      const node = findByPath(original, change.path);

      remove(original, parent, node);
    } else if (isMove(change)) {
      let parent = findByPath(original, change.path);
      if (hasItem(parent)) parent = parent.item;
      if (isKeyValue(parent)) parent = parent.value;

      const node = (parent as WithItems).items[change.from];

      remove(original, parent, node);
      insert(original, parent, node, change.to);
    } else if (isRename(change)) {
      let parent = findByPath(original, change.path.concat(change.from)) as
        | KeyValue
        | InlineItem<KeyValue>;
      let replacement = findByPath(updated, change.path.concat(change.to)) as
        | KeyValue
        | InlineItem<KeyValue>;

      if (hasItem(parent)) parent = parent.item;
      if (hasItem(replacement)) replacement = replacement.item;

      replace(original, parent, parent.key, replacement.key);
    }
  });

  applyWrites(original);
  return original;
}

/**
 * Converts nested inline tables to separate table sections based on the inlineTableStart depth setting.
 * This function recursively processes a table and extracts any inline tables within it,
 * creating separate table sections with properly nested keys.
 * 
 * @param table - The table to process for nested inline tables
 * @param original - The original document for inserting new items
 * @param format - The formatting options
 * @returns Array of additional tables that should be added to the document
 */
function convertNestedInlineTablesToMultiline(table: any, original: Document, format: TomlFormat): any[] {
  const additionalTables: any[] = [];
  
  const processTableForNestedInlines = (currentTable: any, tablesToAdd: any[]) => {
    for (let i = currentTable.items.length - 1; i >= 0; i--) {
      const item = currentTable.items[i];
      if (isKeyValue(item) && isInlineTable(item.value)) {
        // Calculate the depth of this nested table
        const nestedTableKey = [...currentTable.key.item.value, ...item.key.value];
        const depth = calculateTableDepth(nestedTableKey);
        
        // Only convert to separate table if depth is less than inlineTableStart
        if (depth < (format.inlineTableStart ?? 1) && format.inlineTableStart !== 0) {
          // Convert this inline table to a separate table section
          const separateTable = generateTable(nestedTableKey);
          
          // Move all items from the inline table to the separate table
          for (const inlineItem of item.value.items) {
            if (isInlineItem(inlineItem) && isKeyValue(inlineItem.item)) {
              insert(original, separateTable, inlineItem.item, undefined);
            }
          }
          
          // Remove this item from the original table
          currentTable.items.splice(i, 1);
          
          // Update the parent table's end position after removal
          postInlineItemRemovalAdjustment(currentTable);
          
          // Queue this table to be added to the document
          tablesToAdd.push(separateTable);
          
          // Recursively process the new table for further nested inlines
          processTableForNestedInlines(separateTable, tablesToAdd);
        }
      }
    }
  };
  
  processTableForNestedInlines(table, additionalTables);
  return additionalTables;
}

/**
 * Converts an inline table to a separate table section when adding to an existing table.
 * This function creates a new table section with the combined key path and moves all
 * properties from the inline table to the separate table section.
 * 
 * @param child - The KeyValue node with an InlineTable as its value
 * @param parent - The parent table where the KeyValue would be added
 * @param original - The original document for inserting new items
 * @param format - The formatting options
 */
function convertInlineTableToSeparateSection(child: KeyValue, parent: any, original: Document, format: TomlFormat): void {
  // Convert the inline table to a separate table section
  const baseTableKey = parent.key.item.value; // Get the parent table's key path
  const nestedTableKey = [...baseTableKey, ...child.key.value]; // Combine with the new key
  const separateTable = generateTable(nestedTableKey);
  
  // We know child.value is an InlineTable from the calling context
  if (isInlineTable(child.value)) {
    // Move all items from the inline table to the separate table
    for (const inlineItem of child.value.items) {
      if (isInlineItem(inlineItem) && isKeyValue(inlineItem.item)) {
        insert(original, separateTable, inlineItem.item, undefined);
      }
    }
  }
  
  // Add the separate table to the document
  insert(original, original, separateTable, undefined);
  
  // Update the parent table's end position since we're not adding the inline table to it
  postInlineItemRemovalAdjustment(parent);
  
  // Also handle any nested inline tables within the new table
  const additionalTables = convertNestedInlineTablesToMultiline(separateTable, original, format);
  for (const table of additionalTables) {
    insert(original, original, table, undefined);
  }
}