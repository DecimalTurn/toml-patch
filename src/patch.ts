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
  isString,
  hasItem,
  hasItems,
  InlineItem,
  CST,
  Table,
  Value,
  isDateTime
} from './cst';
import diff, { Change, isAdd, isEdit, isRemove, isMove, isRename } from './diff';
import findByPath, { tryFindByPath, findParent } from './find-by-path';
import { last, isInteger, isTemporal, temporalToTomlString } from './utils';
import { insert, replace, remove, applyWrites } from './writer';
import { generateInlineItem, generateTable, generateTableArray, generateString } from './generate';
import { IS_BARE_KEY } from './tokenizer';
import { escapeStringContent } from './escape-preference';
import { resolveTomlFormat } from './toml-format';
import { arrayHadTrailingCommas, tableHadTrailingCommas, postInlineItemRemovalAdjustment, calculateTableDepth } from './formatter';
import { DateFormatHelper } from './date-format';
import {
  getInlineInsertColumnDelta,
  normalizeInlineCommentAlignmentInString,
  preserveAlignedInlineCommentColumn,
  preserveAlignedInlineCommentForDelta,
  recordInlineTableCommentDelta
} from './comment-alignment';
import { getSpan } from './location';
import { stripLeadingBom, UTF8_BOM } from './decode-utf8';

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
  const existing_cst = Array.from(parseTOML(stripLeadingBom(existing)));

  // Auto-detect formatting preferences from the existing TOML string for fallback
  const autoDetectedFormat = TomlFormat.autoDetectFormatWithCst(existing, existing_cst);
  const fmt = resolveTomlFormat(format, autoDetectedFormat);

  const patchedToml = patchCst(existing_cst, updated, fmt).tomlString;
  return fmt.leadingBom ? `${UTF8_BOM}${patchedToml}` : patchedToml;
}

/**
 * Recursively checks if an object graph contains any Temporal values.
 * Used to auto-detect whether temporal mode should be enabled for patching.
 */
function hasTemporal(obj: any, seen: WeakSet<object> = new WeakSet()): boolean {
  if (obj == null || typeof obj !== 'object') return false;
  if (isTemporal(obj)) return true;
  if (seen.has(obj)) return false;
  seen.add(obj);
  for (const v of Object.values(obj)) {
    if (hasTemporal(v, seen)) return true;
  }
  return false;
}

export function patchCst(existing_cst: CST, updated: any, format: TomlFormat): { tomlString: string; document: Document } {
  const items = [...existing_cst];

  // Auto-detect Temporal in the updated JS object so that the internal
  // toJS() diff uses Temporal objects when the user provides them.
  const useTemporal = hasTemporal(updated);

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

  const existing_js = toJS(items, '', { temporal: useTemporal });
  const existing_document: Document = {
    type: NodeType.Document,
    loc: { start: { line: 1, column: 0 }, end: { line: endLine, column: endColumn } },
    items
  };

  // Certain formatting options should not be applied to the updated document during patching, because it would
  // override the existing formatting too aggressively. For example, preferNestedTablesMultiline would
  // convert all nested tables to multiline, which is not be desired during patching.
  // Therefore, we create a modified format for generating the updated document used for diffing.
  const diffing_fmt = resolveTomlFormat({...format, inlineTableStart: undefined}, format);
  const updated_document = parseJS(updated, diffing_fmt);

  // Diff against the JS representation rather than
  // the raw `updated` value, so that any undefined keys (which parseJS already
  // stripped) are consistently absent from both sides of the diff. 
  const updated_js = toJS(updated_document.items, '', { temporal: useTemporal });
  const changes = reorder(diff(existing_js, updated_js));

  if (changes.length === 0) {
    return {
      tomlString: toTOML(items, format),
      document: existing_document
    };
  }

  const patched_document = applyChanges(existing_document, updated_document, changes, format, useTemporal);
  const tomlString = normalizeInlineCommentAlignmentInString(
    patched_document,
    toTOML(patched_document.items, format),
    format
  );

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

function preserveEscapedKeyRaw(existingRaw: string, keyParts: string[]): string {
  return keyParts
    .map(part => (IS_BARE_KEY.test(part) ? part : `"${escapeStringContent(part, existingRaw, 'singleline-basic')}"`))
    .join('.');
}

/**
 * Preserves formatting from the existing node when applying it to the replacement node.
 * This includes multiline string formats, trailing commas, DateTime formats, etc.
 * 
 * @param existing - The existing node with formatting to preserve
 * @param replacement - The replacement node to apply formatting to
 */
function preserveFormatting(existing: Value, replacement: Value): void {
  
  // Preserve string format (handles basic, literal, multiline in all variants)
  if (isString(existing) && isString(replacement)) {
    const newString = generateString(replacement.value, existing.raw);
    replacement.raw = newString.raw;
    replacement.loc = newString.loc;
  }
  
  // Preserve DateTime format
  if (isDateTime(existing) && isDateTime(replacement)) {
    // Analyze the original raw format and create a properly formatted replacement
    const originalRaw = existing.raw;
    const newValue = replacement.value;

    if (isTemporal(newValue)) {
      // Temporal objects preserve their own type — no format conversion needed.
      let raw = temporalToTomlString(newValue);
      // Preserve the original separator style (T vs space) from the existing TOML.
      if (originalRaw.includes(' ') && raw.includes('T')) {
        raw = raw.replace('T', ' ');
      }
      replacement.raw = raw;
      replacement.loc.end.column = replacement.loc.start.column + replacement.raw.length;
      // Keep the Temporal object as the value — it will serialize correctly.
    } else {
      // Create a new date with the original format preserved
      const formattedDate = DateFormatHelper.createDateWithOriginalFormat(newValue, originalRaw);

      // Update the replacement with the properly formatted date
      replacement.value = formattedDate;
      replacement.raw = formattedDate.toISOString();
      replacement.loc.end.column = replacement.loc.start.column + replacement.raw.length;
    }
  }
  
  // Preserve array trailing comma format
  if (isInlineArray(existing) && isInlineArray(replacement)) {
    const originalHadTrailingCommas = arrayHadTrailingCommas(existing);
    if (replacement.items.length > 0) {
      const lastItem = replacement.items[replacement.items.length - 1];
      lastItem.comma = originalHadTrailingCommas;
    }
  }
  
  // Preserve inline table trailing comma format
  if (isInlineTable(existing) && isInlineTable(replacement)) {
    const originalHadTrailingCommas = tableHadTrailingCommas(existing);
    if (replacement.items.length > 0) {
      const lastItem = replacement.items[replacement.items.length - 1];
      lastItem.comma = originalHadTrailingCommas;
    }
  }
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
function applyChanges(original: Document, updated: Document, changes: Change[], format: TomlFormat, temporal: boolean = false): Document {
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
        const updated_js = toJS(updated.items, '', { temporal });
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

      if (isInlineArray(parent)) {
        const rowNode = tryFindByPath(original, parent_path);
        const rowContainer = tryFindByPath(original, parent_path.slice(0, -1));
        if (rowNode && isKeyValue(rowNode) && rowContainer) {
          const deltaColumns = getInlineInsertColumnDelta(parent, child, index);
          if (deltaColumns !== 0) {
            preserveAlignedInlineCommentForDelta(rowContainer, rowNode, deltaColumns);
          }
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
        } else if (format.inlineTableStart === 0 && isKeyValue(child) && isInlineTable(child.value) && isDocument(parent)) {
          insert(original, parent, child, undefined, true);
        } else {
          // Unwrap InlineItem if we're adding to a Table (not InlineTable)
          // InlineItems should only exist within InlineTables or InlineArrays
          let childToInsert = child;
          if (isInlineItem(child) && (isTable(parent) || isDocument(parent))) {
            childToInsert = child.item;
          }
          insert(original, parent, childToInsert);
        }
      }

    } else if (isEdit(change)) {
      let existing = findByPath(original, change.path);
      let replacement = findByPath(updated, change.path);
      let parent;
      const containerParent = tryFindByPath(original, change.path.slice(0, -1));
      const inlineTableRowContext = findEnclosingInlineTableRowContext(original, change.path);

      if (isKeyValue(existing) && isKeyValue(replacement)) {
        // Edit for key-value means value changes
        // Preserve formatting from existing value in replacement value
        preserveFormatting(existing.value, replacement.value);
        if (containerParent) {
          preserveAlignedInlineCommentColumn(containerParent, existing, existing.value, replacement.value);
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
      } else if (isInlineItem(existing) && isKeyValue(existing.item) && isKeyValue(replacement)) {
        // Editing inline table item: existing is InlineItem, replacement is a block-style KeyValue.
        // Preserve the InlineItem's formatting (alignment, equals position) by only swapping the value,
        // not the whole KeyValue — otherwise alignment spaces for the key are lost (as well as the trailing comma).
        const existingKeyValue = existing.item;
        preserveFormatting(existingKeyValue.value, replacement.value);
        parent = existingKeyValue;
        existing = existingKeyValue.value;
        replacement = replacement.value;
      } else if (isInlineItem(existing) && isInlineItem(replacement) && isKeyValue(existing.item) && isKeyValue(replacement.item)) {
        // Both are InlineItems wrapping KeyValues (nested inline table edits)
        // Preserve formatting and edit the value within
        preserveFormatting(existing.item.value, replacement.item.value);
        parent = existing.item;
        existing = existing.item.value;
        replacement = replacement.item.value;
      } else if (isTable(existing)) {
        // Type change: a block table section (e.g: [x.y.z.w]) is being replaced by a scalar value.
        // The diff produces an Edit at path e.g. ['x','y','z','w'], where `existing` is the Table
        // node and `replacement` (from the updated document) may be an InlineItem or KV that does
        // not carry the full scope. Simply splicing it into the Document would lose the scope.
        // Get the JS value at change.path and regenerate a fresh KV + parent table from scratch.
        const updated_js = toJS(updated.items, '', { temporal });
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

      if (inlineTableRowContext) {
        const existingSpan = getSpan(existing.loc);
        const replacementSpan = getSpan(replacement.loc);
        const deltaColumns = replacementSpan.columns - existingSpan.columns;
        if (deltaColumns !== 0) {
          recordInlineTableCommentDelta(inlineTableRowContext.container, inlineTableRowContext.row, deltaColumns);
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

      // Preserve key escape style from the original key raw when renaming.
      // Example: if the original key used "\\u263A", keep that escape form
      // instead of normalizing to the raw character (☺).
      replacement.key.raw = preserveEscapedKeyRaw(parent.key.raw, replacement.key.value);
      replacement.key.loc.end.column = replacement.key.loc.start.column + replacement.key.raw.length;

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
function convertNestedInlineTablesToMultiline(table: Table, original: Document, format: TomlFormat): Table[] {
  const additionalTables: Table[] = [];
  
  const processTableForNestedInlines = (currentTable: Table, tablesToAdd: Table[]) => {
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
function convertInlineTableToSeparateSection(child: KeyValue, parent: Table, original: Document, format: TomlFormat): void {
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

function findEnclosingInlineTableRowContext(
  document: Document,
  path: Array<string | number>
): { container: TreeNode; row: KeyValue } | undefined {
  for (let i = path.length - 1; i > 0; i--) {
    const candidate = tryFindByPath(document, path.slice(0, i));
    if (!candidate || !isKeyValue(candidate) || !isInlineTable(candidate.value)) continue;

    const container = tryFindByPath(document, path.slice(0, i - 1));
    if (container && hasItems(container)) {
      return { container, row: candidate };
    }
  }
}