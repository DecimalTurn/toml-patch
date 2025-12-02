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
  AST,
  Table
} from './ast';
import diff, { Change, isAdd, isEdit, isRemove, isMove, isRename } from './diff';
import findByPath, { tryFindByPath, findParent } from './find-by-path';
import { last, isInteger } from './utils';
import { insert, replace, remove, applyWrites } from './writer';
import { generateInlineItem, generateTable } from './generate';
import { validate } from './validate';
import { arrayHadTrailingCommas, tableHadTrailingCommas, resolveTomlFormat } from './toml-format';

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

  const updated_document = parseJS(updated, format);
  const changes = reorder(diff(existing_js, updated));
  console.log('Generated changes for deeply nested:', changes.map(c => ({ type: c.type, path: c.path })));

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
      console.log('Found child type:', child.type, 'for path:', change.path, 'with preferMultilineTable:', format.preferMultilineTable);
      const parent_path = change.path.slice(0, -1);
      let index = last(change.path)! as number;

      let is_table_array = isTableArray(child);
      if (isInteger(index) && !parent_path.some(isInteger)) {
        const sibling = tryFindByPath(original, parent_path.concat(0));
        if (sibling && isTableArray(sibling)) {
          is_table_array = true;
        }
      }

      let parent: TreeNode;
      if (isTable(child)) {
        parent = original;
        console.log('Child is Table, inserting directly to document');
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
        // Special handling for Tables being added to Document when preferMultilineTable is true
        if (isDocument(parent) && isTable(child) && format.preferMultilineTable) {
          console.log('Processing Table being added to Document with preferMultilineTable: true');
          console.log('Table items:', child.items.map(item => ({ type: item.type, key: item.type === 'KeyValue' ? (item as KeyValue).key.value : 'N/A', valueType: item.type === 'KeyValue' ? (item as KeyValue).value.type : 'N/A' })));
          
          // Check if this table contains inline tables that should be converted to separate table sections
          const inlineTableItems = child.items.filter(item => 
            isKeyValue(item) && isInlineTable(item.value)
          ) as KeyValue[];
          
          if (inlineTableItems.length > 0) {
            console.log('Found inline tables in the table that need conversion:', inlineTableItems.length);
            
            // First, insert the main table (without inline table items)
            for (const keyValue of inlineTableItems) {
              const itemIndex = child.items.indexOf(keyValue);
              child.items.splice(itemIndex, 1);
            }
            
            // Insert the main table first (always, even if empty, to preserve structure)
            insert(original, parent, child, index);
            
            // Then create and insert nested table sections
            for (const keyValue of inlineTableItems) {
              console.log('Converting inline table:', keyValue.key.value);
              
              // Create nested table section
              const nestedTablePath = [...child.key.item.value, ...keyValue.key.value];
              const nestedTable = generateTable(nestedTablePath);
              
              const inlineTable = keyValue.value as any;
              for (const inlineItem of inlineTable.items) {
                insert(nestedTable, nestedTable, inlineItem.item);
              }
              applyWrites(nestedTable);
              
              // Insert the nested table section into the document
              insert(original, parent, nestedTable);
            }
            
            // Don't insert the original table again since we already inserted it or its nested tables
            return;
          }
        }
        
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
        
        insert(original, parent, child, index);
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
      } else if (isTable(parent) && isKeyValue(child) && isInlineTable(child.value) && format.preferMultilineTable) {
        // Convert inline table to separate table section when preferMultilineTable is true
        console.log('Converting KeyValue with InlineTable to separate table section');
        const parentTablePath = parent.key.item.value;
        const nestedTablePath = [...parentTablePath, ...child.key.value];
        const nestedTable = generateTable(nestedTablePath);
        
        const inlineTable = child.value as any;
        for (const inlineItem of inlineTable.items) {
          insert(nestedTable, nestedTable, inlineItem.item);
        }
        applyWrites(nestedTable);
        insert(original, original, nestedTable);
      } else if (isInlineItem(child) && isKeyValue(child.item)) {
        // Handle case where findByPath returns InlineItem wrapping KeyValue
        // Extract the KeyValue and insert it properly
        const keyValue = child.item;
        console.log('Found InlineItem wrapping KeyValue, checking conditions:');
        console.log('- parent is Table:', isTable(parent));
        console.log('- keyValue.value is InlineTable:', isInlineTable(keyValue.value));
        console.log('- preferMultilineTable:', format.preferMultilineTable);
        
        if (isTable(parent) && isInlineTable(keyValue.value) && format.preferMultilineTable) {
          // Convert to separate table section
          console.log('Converting to separate table section');
          const parentTablePath = parent.key.item.value;
          const nestedTablePath = [...parentTablePath, ...keyValue.key.value];
          const nestedTable = generateTable(nestedTablePath);
          
          const inlineTable = keyValue.value as any;
          for (const inlineItem of inlineTable.items) {
            insert(nestedTable, nestedTable, inlineItem.item);
          }
          applyWrites(nestedTable);
          insert(original, original, nestedTable);
        } else {
          // Regular insertion
          console.log('Regular insertion');
          insert(original, parent, keyValue);
        }
      } else if (isTable(child)) {
        // Handle adding Table nodes directly to the document
        console.log('ENTERING TABLE HANDLING BLOCK');
        insert(original, original, child);
      } else {
        insert(original, parent, child);
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
