import parseTOML from './parse-toml';
import parseJS from './parse-js';
import toTOML from './to-toml';
import { PatchLiteFormat, createDefaultPatchLiteFormat } from './patch-lite-format';
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
  hasItems,
  InlineItem,
  CST,
  Table
} from './cst';
import diff, { Change, isAdd, isEdit, isRemove, isMove, isRename } from './diff';
import { last, isInteger } from './utils';
import { insert, replace, remove, applyWrites } from './writer';
import { generateInlineItem, generateTable, generateTableArray } from './generate';

type Path = Array<string | number>;

/**
 * Applies modifications to a TOML document by comparing an existing TOML string with updated JavaScript data.
 * 
 * This function preserves formatting and comments from the existing TOML document while
 * applying changes from the updated data structure. It performs a diff between the existing
 * and updated data, then strategically applies only the necessary changes to maintain the
 * original document structure as much as possible.
 * 
 * @param existing - The original TOML document as a string
 * @param existing_js - The JavaScript object equivalent of the original TOML
 * @param updated - The updated JavaScript object with desired changes
 * @returns A new TOML string with the changes applied
 */
export default function patchLite(
  existing: string,
  existing_js: any,
  updated: any
): string {
  const existing_cst = Array.from(parseTOML(existing));
  const patchedToml = patchCstLite(existing_cst, existing_js, updated).tomlString;
  return patchedToml;
}

export function patchCstLite(
  existing_cst: CST,
  existing_js: any,
  updated: any
): { tomlString: string; document: Document } {
  const format = createDefaultPatchLiteFormat();
  const items = [...existing_cst];

  // Compute the Document's end position from its children so that
  // offset-based position updates in applyWrites start from the correct
  // baseline (instead of 0,0 which under-counts after expansion).
  let endLine = 1;
  let endColumn = 0;
  for (const item of items) {
    const e = item.loc.end;
    if (e.line > endLine || (e.line === endLine && e.column > endColumn)) {
      endLine = e.line;
      endColumn = e.column;
    }
  }

  const existing_document: Document = {
    type: NodeType.Document,
    loc: { start: { line: 1, column: 0 }, end: { line: endLine, column: endColumn } },
    items
  };

  // Certain formatting options should not be applied to the updated document during patching, because it would
  // override the existing formatting too aggressively. For example, preferNestedTablesMultiline would
  // convert all nested tables to multiline, which is not be desired during patching.
  // Therefore, we create a modified format for generating the updated document used for diffing.
  const diffing_fmt: PatchLiteFormat = { ...format, inlineTableStart: undefined };
  const updated_document = parseJS(updated, diffing_fmt);

  // In lite mode we intentionally avoid importing toJS and rely on the caller's
  // provided JS values for the diff baseline.
  const updated_js = updated;
  const changes = reorder(diff(existing_js, updated_js));

  if (changes.length === 0) {
    return {
      tomlString: toTOML(items, format),
      document: existing_document
    };
  }

  const patched_document = applyChanges(existing_document, updated_document, updated_js, changes, format);
  const tomlString = toTOML(patched_document.items, format);

  return {
    tomlString,
    document: patched_document
  };
}

function reorder(changes: Change[]): Change[] {
  //Reorder deletions among themselves to avoid index issues
  // We want the path to be looking at the last item in the array first and go down from there

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
          // We reset i to -1 so that after the for-loop's i++ the next iteration
          // starts at 0 and re-checks the newly promoted element.
          i = -1;
          break;
        }
        j++;
      }
    }
  }
  
  return changes;

}

function pathsEqual(a: Path, b: Path): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function findByPath(node: TreeNode, path: Path): TreeNode {
  if (!path.length) {
    if (isInlineItem(node) && isKeyValue(node.item)) {
      return node.item;
    }
    return node;
  }

  if (isKeyValue(node)) {
    return findByPath(node.value, path);
  }

  if (hasItems(node)) {
    const indexes: Record<string, number> = {};

    for (let itemIndex = 0; itemIndex < node.items.length; itemIndex++) {
      const item = node.items[itemIndex];
      let key: Path = [];

      if (isKeyValue(item)) {
        key = item.key.value;
      } else if (isTable(item)) {
        key = item.key.item.value;
      } else if (isTableArray(item)) {
        key = item.key.item.value;
        const keyString = JSON.stringify(key);
        if (indexes[keyString] === undefined) indexes[keyString] = 0;
        const arrayIndex = indexes[keyString]++;
        key = key.concat(arrayIndex);
      } else if (isInlineItem(item) && isKeyValue(item.item)) {
        key = item.item.key.value;
      } else if (isInlineItem(item)) {
        key = [itemIndex];
      }

      if (!key.length || !pathsEqual(key, path.slice(0, key.length))) continue;

      const remainingPath = path.slice(key.length);

      if (isInlineItem(item) && isKeyValue(item.item)) {
        if (path.length === key.length) {
          return item;
        }
        return findByPath(item.item.value, remainingPath);
      }

      if (isInlineItem(item) && path.length > key.length) {
        return findByPath(item.item, remainingPath);
      }

      return findByPath(item, remainingPath);
    }
  }

  throw new Error(`Node not found at ${path.join('.')}`);
}

function tryFindByPath(node: TreeNode, path: Path): TreeNode | undefined {
  try {
    return findByPath(node, path);
  } catch {}
}

function findParent(node: TreeNode, path: Path): TreeNode {
  let parentPath = path;
  let parent: TreeNode | undefined;

  while (parentPath.length && !parent) {
    parentPath = parentPath.slice(0, -1);
    parent = tryFindByPath(node, parentPath);
  }

  if (!parent) {
    throw new Error(`Parent not found for ${path.join('.')}`);
  }

  return parent;
}

/**
 * Applies a list of changes to the original TOML document CST while preserving formatting and structure.
 * 
 * This function processes different types of changes (Add, Edit, Remove, Move, Rename) and applies them
 * to the original document in a way that maintains the existing formatting preferences, comments, and
 * structural elements as much as possible. Special handling is provided for different node types like
 * inline tables, arrays, and table arrays to ensure proper formatting consistency.
 * 
 * @param original - The original TOML document CST to be modified
 * @param updated - The updated document CST containing new values for changes
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
function applyChanges(
  original: Document,
  updated: Document,
  updated_js: any,
  changes: Change[],
  format: PatchLiteFormat
): Document {
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

      let child = findByPath(updated, change.path);
      const parent_path = change.path.slice(0, -1);
      let index = last(change.path)! as number;

      let is_table_array = isTableArray(child);
      // Detect AOT append: the new entry is an integer index and the immediate
      // parent key is a string (covers both top-level and nested AOTs such as
      // [[fruit]] or [[fruit.variety]]).
      if (isInteger(index) && !is_table_array && !isInteger(last(parent_path))) {
        const sibling = tryFindByPath(original, parent_path.concat(0));
        if (sibling && isTableArray(sibling)) {
          is_table_array = true;
        }
      }
      // When is_table_array is true but the child from the updated document is not
      // a TableArray block (e.g. parseJS inlined it because of inlineTableStart),
      // regenerate a fresh TableArray from the JS value.
      if (is_table_array && !isTableArray(child)) {
        const tableArrayKey = parent_path.filter(p => typeof p === 'string') as string[];
        let jsValue: any = updated_js;
        for (const k of change.path) jsValue = jsValue?.[k];
        if (jsValue !== undefined) {
          const freshTableArray = generateTableArray(tableArrayKey);
          const entryDoc = parseJS(jsValue, format);
          for (const item of entryDoc.items) {
            insert(freshTableArray, freshTableArray, item, undefined);
          }
          applyWrites(freshTableArray);
          child = freshTableArray;
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
        } else if (isInlineItem(parent) && isKeyValue(parent.item)) {
          parent = parent.item.value;
        } else if (isInlineItem(parent) && isInlineTable(parent.item)) {
          parent = parent.item;
        }
      }

      if (isTableArray(parent) || isInlineArray(parent) || isDocument(parent)) {
        // Root-level key-values belong to TOML's implicit root table, which
        // spans from the start of the document up to (but not including) the
        // first explicit section header ([table] or [[array]]). When the index
        // is a string key, insert() falls back to parent.items.length —
        // appending after all sections and silently nesting the new key under
        // the last one. Clamp to the end of the root table scope instead.
        // For non-KV children (e.g. table-array entries) the index was already
        // resolved to a correct integer above, so leave it as-is.
        let resolvedIndex = index;
        if (isDocument(parent) && isKeyValue(child)) {
          const rootTableEnd = (parent as Document).items.findIndex(
            item => isTable(item) || isTableArray(item)
          );
          if (rootTableEnd !== -1) {
            resolvedIndex = rootTableEnd;
          }
        }
        insert(original, parent, child, resolvedIndex);
      } else if (isInlineTable(parent)) {
        // Special handling for adding KeyValue to InlineTable
        // InlineTable items must be wrapped in InlineItem
        if (isKeyValue(child)) {
          const inlineItem = generateInlineItem(child);
          insert(original, parent, inlineItem);
        } else {
          insert(original, parent, child);
        }
      } else {
        // Unwrap InlineItem if we're adding to a Table (not InlineTable)
        // InlineItems should only exist within InlineTables or InlineArrays
        let childToInsert = child;
        if (isInlineItem(child) && (isTable(parent) || isDocument(parent))) {
          childToInsert = child.item;
        }
        insert(original, parent, childToInsert);
      }

    } else if (isEdit(change)) {
      let existing = findByPath(original, change.path);
      let replacement = findByPath(updated, change.path);
      let parent;
      const containerParent = tryFindByPath(original, change.path.slice(0, -1));

      if (isKeyValue(existing) && isKeyValue(replacement)) {
        // Edit for key-value means value changes
        parent = existing;
        existing = existing.value;
        replacement = replacement.value;
      } else if (isKeyValue(existing) && isInlineItem(replacement) && isKeyValue(replacement.item)) {
        // Sometimes, the replacement looks like it could be an inline item, but the original is a key-value
        // In this case, we convert the replacement to a key-value to match the original
        parent = existing;
        existing = existing.value;
        replacement = replacement.item.value;
      } else if (isInlineItem(existing) && isKeyValue(existing.item) && isKeyValue(replacement)) {
        // Editing inline table item: existing is InlineItem, replacement is a block-style KeyValue.
        // Preserve the InlineItem's formatting (alignment, equals position) by only swapping the value,
        // not the whole KeyValue — otherwise alignment spaces for the key are lost (as well as the trailing comma).
        const existingKeyValue = existing.item;
        parent = existingKeyValue;
        existing = existingKeyValue.value;
        replacement = replacement.value;
      } else if (isInlineItem(existing) && isInlineItem(replacement) && isKeyValue(existing.item) && isKeyValue(replacement.item)) {
        // Both are InlineItems wrapping KeyValues (nested inline table edits)
        // Edit the value within
        parent = existing.item;
        existing = existing.item.value;
        replacement = replacement.item.value;
      } else if (isTable(existing)) {
        // Type change: a block table section (e.g: [x.y.z.w]) is being replaced by a scalar value.
        // The diff produces an Edit at path e.g. ['x','y','z','w'], where `existing` is the Table
        // node and `replacement` (from the updated document) may be an InlineItem or KV that does
        // not carry the full scope. Simply splicing it into the Document would lose the scope.
        // Get the JS value at change.path and regenerate a fresh KV + parent table from scratch.
        let jsValue: any = updated_js;
        for (const key of change.path) {
          jsValue = jsValue?.[key];
        }

        if (jsValue !== undefined) {
          const existingTableKey = (existing as Table).key.item.value;
          const lastSegment = existingTableKey.slice(-1);
          const parentKey = existingTableKey.slice(0, -1);
          const tableParent = findParent(original, change.path);

          // Regenerate a fresh KV using parseJS on just the single key-value
          const freshDoc = parseJS({ [lastSegment[0]]: jsValue }, format);
          const freshKV = freshDoc.items[0] as KeyValue;

          if (parentKey.length > 0) {
            const newTable = generateTable(parentKey);
            insert(original, newTable, freshKV, 0);
            replace(original, tableParent, existing, newTable);
          } else {
            // Single-segment table [w] — KV belongs directly in the Document
            replace(original, tableParent, existing, freshKV);
          }
          return; // handled; skip the generic replace() below
        }

        // Could not resolve the JS value — fall back to generic handling
        parent = findParent(original, change.path);
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
      const node = tryFindByPath(original, change.path);

      if (!node) {
        // The path likely refers to all entries of a TableArray sequence
        // (e.g. path ['tasks'] when the CST stores entries at ['tasks',0], ['tasks',1]…).
        // Remove all entries by repeatedly pulling the one at index 0.
        const first = tryFindByPath(original, change.path.concat(0));
        if (first) {
          let entry: TreeNode | undefined;
          while ((entry = tryFindByPath(original, change.path.concat(0)))) {
            remove(original, original, entry);
          }
        } else {
          // Not a table array — let findByPath throw the descriptive error.
          findByPath(original, change.path);
        }
      } else {
        let parent = findParent(original, change.path);
        if (isKeyValue(parent)) {
          parent = parent.value;
        }
        // When the parent is an InlineItem wrapping a KeyValue (nested inline table), unwrap to the
        // inner InlineTable so `remove` receives a node type that `hasItems` accepts.
        if (isInlineItem(parent) && isKeyValue((parent as InlineItem).item)) {
          parent = ((parent as InlineItem).item as KeyValue).value;
        }
        // When the parent is an InlineItem wrapping an InlineTable (an object inside an inline
        // array, e.g. `items = [{ name = "x", color = "y" }]`), unwrap to the InlineTable so
        // `remove` receives a node type that `hasItems` accepts.
        if (isInlineItem(parent) && isInlineTable((parent as InlineItem).item)) {
          parent = (parent as InlineItem).item;
        }
        // The logical (JS-object) parent may differ from the CST parent.
        // For example, [server.tls] lives in document.items, not [server].items.
        // Fall back to the document root when the parent doesn't contain the node.
        if (hasItems(parent) && !(parent.items as TreeNode[]).includes(node)) {
          parent = original;
        }

        remove(original, parent, node);
      }
    } else if (isMove(change)) {
      let parent = tryFindByPath(original, change.path);
      if (parent) {
        if (hasItem(parent)) parent = parent.item;
        if (isKeyValue(parent)) parent = parent.value;

        const node = (parent as WithItems).items[change.from];

        remove(original, parent, node);
        insert(original, parent, node, change.to);
      } else {
        // TableArray sequence: the path refers to a collection of [[name]] entries
        // spread across Document.items (each at an indexed sub-path).
        // Find source entry, remove it, then re-insert at the target position.
        const fromNode = findByPath(original, change.path.concat(change.from));
        remove(original, original, fromNode);

        // After removal, the entry now at virtual index change.to gives us the
        // Document.items insertion point.
        const toEntry = tryFindByPath(original, change.path.concat(change.to));
        const toIndex = toEntry
          ? original.items.indexOf(toEntry as any)
          : original.items.length;
        insert(original, original, fromNode, toIndex);
      }
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
