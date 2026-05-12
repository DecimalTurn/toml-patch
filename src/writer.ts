import {
  NodeType,
  TreeNode,
  Document,
  Key,
  Value,
  InlineArray,
  InlineArrayItem,
  InlineTableItem,
  isKeyValue,
  isTable,
  isTableArray,
  isInlineTable,
  isInlineArray,
  hasItems,
  hasItem,
  isComment,
  isDocument,
  InlineTable,
  TableArray,
  TableKey,
  TableArrayKey,
  Table,
  KeyValue,
  Comment,
  InlineItem,
  isInlineItem,
  Block,
  isBlock,
  WithItems
} from './ast';
import { Span, getSpan, clonePosition } from './location';
import { last } from './utils';
import traverse from './traverse';

////////////////////////////////////////
// The purpose of this file is to provide a way to modify the CST
////////////////////////////////////////


// Root node of the CST
export type Root = Document | TreeNode;

// Store line and column offsets per node
//
// Some offsets are applied on enter (e.g. shift child items and next items)
// Others are applied on exit (e.g. shift next items)
type Offsets = WeakMap<TreeNode, Span>;

// Track which roots have pending offsets to avoid unnecessary applyWrites traversals
const dirty_roots: WeakSet<Root> = new WeakSet();

const enter_offsets: WeakMap<Root, Offsets> = new WeakMap();
const getEnterOffsets = (root: Root) => {
  if (!enter_offsets.has(root)) {
    enter_offsets.set(root, new WeakMap());
  }
  return enter_offsets.get(root)!;
};

const exit_offsets: WeakMap<Root, Offsets> = new WeakMap();
const getExitOffsets = (root: Root) => {
  if (!exit_offsets.has(root)) {
    exit_offsets.set(root, new WeakMap());
  }
  return exit_offsets.get(root)!;
};

//TODO: Add getOffsets function to get all offsets contained in the tree
export function replace(root: Root, parent: TreeNode, existing: TreeNode, replacement: TreeNode) {
  
  // First, replace existing node
  // (by index for items, item, or key/value)
  if (hasItems(parent)) {

    const index = parent.items.indexOf(existing);
    if (index < 0) {
      throw new Error(`Item not found in parent for replace`);
    }

    parent.items.splice(index, 1, replacement);

    // This next case is a special case for Inline-Table item
    // however due to the fact that both replacement of the whole Inline-Table and Inline-Table element will have the same parent,
    // we need to make sure it's not an Inline-Table 
  } else if (isKeyValue(parent) && isInlineTable(parent.value) && !isInlineTable(existing)) {
    
    const index = parent.value.items.indexOf(existing as InlineTableItem);
    if (index < 0) {
      throw new Error(`Item not found in parent for replace`);
    } 
    parent.value.items.splice(index, 1, replacement as InlineTableItem);

  } else if (hasItem(parent)) {

    parent.item = replacement;

  } else if (isKeyValue(parent)) {

    if (parent.key === existing) {
      parent.key = replacement as Key;
    } else {
      parent.value = replacement as Value;
    }

  } else {
    throw new Error(`Unsupported parent type "${parent.type}" for replace`);
  }

  // Shift the replacement node into the same start position as existing
  const shift = {
    lines: existing.loc.start.line - replacement.loc.start.line,
    columns: existing.loc.start.column - replacement.loc.start.column
  };
  shiftNode(replacement, shift);

  // Apply offsets after replacement node
  const existing_span = getSpan(existing.loc);
  const replacement_span = getSpan(replacement.loc);
  const offset = {
    lines: replacement_span.lines - existing_span.lines,
    columns: replacement_span.columns - existing_span.columns
  };

  addOffset(offset, getExitOffsets(root), replacement, existing);
  dirty_roots.add(root);
}
/**
 * Inserts a child node into the CST.
 *
 * @param root - The root node of the CST
 * @param parent - The parent node to insert the child into
 * @param child - The child node to insert
 * @param index - The index at which to insert the child (optional)
 * @param forceInline - Whether to force inline positioning even for document-level insertions (optional)
 */
export function insert(root: Root, parent: TreeNode, child: TreeNode, index?: number, forceInline?: boolean) {
  if (!hasItems(parent)) {
    throw new Error(`Unsupported parent type "${(parent as TreeNode).type}" for insert`);
  }

  index = (index != null && typeof index === 'number') ? index : parent.items.length; 

  let shift: Span;
  let offset: Span;
  if (isInlineArray(parent) || isInlineTable(parent)) {
    ({ shift, offset } = insertInline(parent, child as InlineItem, index));
  } else if (forceInline && isDocument(parent)) {
    ({ shift, offset } = insertInlineAtRoot(parent, child, index));
  } else {
    ({ shift, offset } = insertOnNewLine(
      parent as Document | Table | TableArray,
      child as KeyValue | Comment,
      index
    ));
  }

  shiftNode(child, shift);

  // The child element is placed relative to the previous element,
  // if the previous element has an offset, need to position relative to that
  // -> Move previous offset to child's offset
  const previous = parent.items[index - 1];
  const previous_offset = previous && getExitOffsets(root).get(previous);
  if (previous_offset) {
    offset.lines += previous_offset.lines;
    offset.columns += previous_offset.columns;

    getExitOffsets(root).delete(previous!);
  }

  // Handle orphaned comments for multiline inline table inserts (analogous to the
  // remove case below). When a new item is added on a new line inside a multiline
  // inline table, the exit offset on the inserted child bleeds to Document-level
  // comments that were extracted from inside the inline table by the parser.
  // Pre-compensate comments that appear before the insertion line so the bleedthrough
  // leaves them at their original position.
  if (isInlineTable(parent) && offset.lines !== 0 && hasItems(root) && root !== parent) {
    const insertionLine = child.loc.start.line;
    const rootItems = (root as WithItems).items;
    for (let i = 0; i < rootItems.length; i++) {
      const item = rootItems[i];
      if (!isComment(item)) continue;
      const commentLine = (item as Comment).loc.start.line;
      if (commentLine < insertionLine) {
        (item as Comment).loc.start.line -= offset.lines;
        (item as Comment).loc.end.line -= offset.lines;
      }
    }
  }

  const offsets = getExitOffsets(root);
  offsets.set(child, offset);
  dirty_roots.add(root);
}

function insertOnNewLine(
  parent: Document | Table | TableArray,
  child: Block,
  index: number
): { shift: Span; offset: Span } {

  if (!isBlock(child)) {
    throw new Error(`Incompatible child type "${(child as TreeNode).type}"`);
  }

  const previous = parent.items[index - 1];
  const use_first_line = isDocument(parent) && !parent.items.length;
  // Inserting at position 0 of a non-empty Document: no previous sibling but the
  // document already has content. The new item lands at line 1 (no leading blank)
  // and all existing items must be shifted down to make room. This happens when a
  // new root-table key-value is prepended before the first explicit section header.
  const prepend_to_document = isDocument(parent) && !use_first_line && previous === undefined;

  parent.items.splice(index, 0, child);

  // Set start location from previous item or start of array
  // (previous is undefined for empty array or inserting at first item)
  const start = previous
    ? {
      line: previous.loc.end.line,
      column: !isComment(previous) ? previous.loc.start.column : parent.loc.start.column
    }
    : clonePosition(parent.loc.start);
  
  const isSquareBracketsStructure = isTable(child) || isTableArray(child);
  let leading_lines = 0;
  if (use_first_line || prepend_to_document) {
    // 0 leading lines — item starts at line 1
  } else if (isSquareBracketsStructure) {
    leading_lines = 2;
  } else {
    leading_lines = 1;
  }
  start.line += leading_lines;

  const shift = {
    lines: start.line - child.loc.start.line,
    columns: start.column - child.loc.start.column
  };

  // Apply offsets after child node
  const child_span = getSpan(child.loc);
  // When prepending to a non-empty document, push all existing items down by the
  // new child's physical line count plus one newline separator. The existing
  // items' original leading-lines budget is already encoded in their loc.start.line
  // values, so we only need to account for the space the new child occupies.
  const offset_lines = prepend_to_document
    ? child_span.lines + 1
    : child_span.lines + (leading_lines - 1);
  const offset = {
    lines: offset_lines,
    columns: child_span.columns
  };

  return { shift, offset };
}

/**
 * Calculates positioning (shift and offset) for inserting a child into a parent container.
 * This function handles the core positioning logic used to insert an inline item inside a table (or at the document root level).
 * 
 * @param parent - The parent container (Document, InlineArray or InlineTable)
 * @param child - The child node to be inserted
 * @param index - The insertion index within the parent's items
 * @param options - Configuration options for positioning calculation
 * @param options.useNewLine - Whether to place the child on a new line
 * @param options.skipCommaSpace - Number of columns to skip for comma + space (default: 2)
 * @param options.skipBracketSpace - Number of columns to skip for bracket/space (default: 1)
 * @param options.hasCommaHandling - Whether comma handling logic should be applied
 * @param options.isLastElement - Whether this is the last element in the container
 * @param options.hasSeparatingCommaBefore - Whether a comma should precede this element
 * @param options.hasSeparatingCommaAfter - Whether a comma should follow this element
 * @param options.hasTrailingComma - Whether the element has a trailing comma
 * @returns Object containing shift (positioning adjustment for the child) and offset (adjustment for following elements)
 */
function calculateInlinePositioning(
  parent: Document | InlineArray | InlineTable,
  child: TreeNode,
  index: number,
  options: {
    useNewLine?: boolean;
    skipCommaSpace?: number;
    skipBracketSpace?: number;
    hasCommaHandling?: boolean;
    isLastElement?: boolean;
    hasSeparatingCommaBefore?: boolean;
    hasSeparatingCommaAfter?: boolean;
    hasTrailingComma?: boolean;
  } = {}
): { shift: Span; offset: Span } {
  
  // Configuration options with default values
  const {
    useNewLine = false,
    skipCommaSpace = 2,
    skipBracketSpace = 1,
    hasCommaHandling = false,
    isLastElement = false,
    hasSeparatingCommaBefore = false,
    hasSeparatingCommaAfter = false,
    hasTrailingComma = false
  } = options;

  // Store preceding node
  const previous = index > 0 ? parent.items[index - 1] : undefined;

  // Set start location from previous item or start of parent
  const start = previous
    ? {
      line: previous.loc.end.line,
      column: useNewLine
        ? !isComment(previous)
          ? previous.loc.start.column
          : parent.loc.start.column
        : previous.loc.end.column
    }
    : clonePosition(parent.loc.start);

  let leading_lines = 0;
  if (useNewLine) {
    leading_lines = 1;
  } else {
    // Add spacing for inline positioning
    const hasSpacing = hasSeparatingCommaBefore || (!hasCommaHandling && !!previous);
    if (hasSpacing && hasCommaHandling) {
      start.column += skipCommaSpace;
    } else if (hasSpacing || (hasCommaHandling && !previous)) {
      start.column += skipBracketSpace;
    }
  }
  start.line += leading_lines;

  const shift = {
    lines: start.line - child.loc.start.line,
    columns: start.column - child.loc.start.column
  };

  // Apply offsets after child node
  const child_span = getSpan(child.loc);
  
  if (!hasCommaHandling) {
    // For documents or contexts without comma handling, simpler offset calculation
    const offset = {
      lines: child_span.lines + (leading_lines - 1),
      columns: child_span.columns
    };
    return { shift, offset };
  }

  // Special case: Fix trailing comma spacing issue for arrays that have trailing commas
  const has_trailing_comma_spacing_bug = 
    hasSeparatingCommaBefore && 
    hasTrailingComma &&          
    !hasSeparatingCommaAfter && 
    isLastElement;                       

  let trailing_comma_offset_adjustment = 0;
  if (has_trailing_comma_spacing_bug) {
    trailing_comma_offset_adjustment = -1;
  }
    
  const offset = {
    lines: child_span.lines + (leading_lines - 1),
    columns: child_span.columns + 
             (hasSeparatingCommaBefore || hasSeparatingCommaAfter ? skipCommaSpace : 0) + 
             (hasTrailingComma ? 1 + trailing_comma_offset_adjustment : 0)
  };

  return { shift, offset };
}

function insertInline(
  parent: InlineArray | InlineTable,
  child: InlineItem,
  index: number
): { shift: Span; offset: Span } {
  if (!isInlineItem(child)) {
    throw new Error(`Incompatible child type "${(child as TreeNode).type}"`);
  }

  // Store preceding node and insert
  const previous = index != null ? parent.items[index - 1] : last(parent.items as TreeNode[]);
  const is_last = index == null || index === parent.items.length;

  parent.items.splice(index, 0, child);

  // Add commas as-needed
  const has_separating_comma_before = !!previous;
  const has_separating_comma_after = !is_last;
  if (has_separating_comma_before) {
    (previous as InlineArrayItem | InlineTableItem).comma = true;
  }
  if (has_separating_comma_after) {
    child.comma = true;
  }

  // Use new line for arrays/tables that span multiple lines (one item per line)
  const use_new_line = perLine(parent);
  const has_trailing_comma = is_last && child.comma === true;

  return calculateInlinePositioning(parent, child, index, {
    useNewLine: use_new_line,
    hasCommaHandling: true,
    isLastElement: is_last,
    hasSeparatingCommaBefore: has_separating_comma_before,
    hasSeparatingCommaAfter: has_separating_comma_after,
    hasTrailingComma: has_trailing_comma
  });
}

/**
 * Inserts a child into a Document with inline positioning behavior.
 * This provides inline-style spacing while maintaining Document's Block item types.
 */
function insertInlineAtRoot(
  parent: Document,
  child: TreeNode,
  index: number
): { shift: Span; offset: Span } {
  // Calculate positioning as if inserting into an inline context
  const result = calculateInlinePositioning(parent, child, index, {
    useNewLine: false,
    hasCommaHandling: false
  });
  
  // Insert the child directly into the Document (as a Block item)
  parent.items.splice(index, 0, child as KeyValue | Comment);
  
  return result;
}

export function remove(root: Root, parent: TreeNode, node: TreeNode) {
  // Remove an element from the parent's items
  // (supports Document, Table, TableArray, InlineTable, and InlineArray
  //
  //      X
  // [ 1, 2, 3 ]
  //    ^-^
  // -> Remove element 2 and apply 0,-3 offset to 1
  //
  // [table]
  // a = 1
  // b = 2 # X
  // c = 3
  // -> Remove element 2 and apply -1,0 offset to 1
  if (!hasItems(parent)) {
    throw new Error(`Unsupported parent type "${parent.type}" for remove`);
  }

  let index = parent.items.indexOf(node);
  if (index < 0) {
    // Try again, looking at child items for nodes like InlineArrayItem
    index = parent.items.findIndex(item => hasItem(item) && item.item === node);

    if (index < 0) {
      throw new Error('Node not found in parent for removal');
    }

    node = parent.items[index];
  }

  const previous = parent.items[index - 1];
  let next = parent.items[index + 1];

  // Remove node
  parent.items.splice(index, 1);
  let removed_span = getSpan(node.loc);

  // Remove an associated comment that appears on the same line
  //
  // [table]
  // a = 1
  // b = 2 # remove this too
  // c = 3
  //
  // TODO InlineTable - this only applies to comments in Table/TableArray
  if (next && isComment(next) && next.loc.start.line === node.loc.end.line) {
    // Add comment to removed
    removed_span = getSpan({ start: node.loc.start, end: next.loc.end });

    // Shift to next item
    // (use same index since node has already been removed)
    next = parent.items[index + 1];

    // Remove comment
    parent.items.splice(index, 1);
  }

  // For inline tables and arrays, check whether the line should be kept
  const is_inline = previous && isInlineItem(previous) || next && isInlineItem(next);
  const previous_on_same_line = previous && previous.loc.end.line === node.loc.start.line;
  const next_on_sameLine = next && next.loc.start.line === node.loc.end.line;
  const keep_line = is_inline && (previous_on_same_line || next_on_sameLine);

  const offset = {
    lines: -(removed_span.lines - (keep_line ? 1 : 0)),
    // Column offsets only apply when removing inline content on the same line.
    // For block-level removals (entire lines removed), subsequent items on
    // different lines need no column adjustment — only a line shift.
    columns: keep_line ? -removed_span.columns : 0
  };

  // If there is nothing left, don't perform any offsets.
  //
  // Exception: multiline inline containers (InlineTable / InlineArray whose opening
  // and closing brackets are on different lines).  For those, `offset.lines` must
  // stay intact so that `applyWrites` shifts the closing bracket up to close the
  // gap left by the removed item.  Single-line containers are fine to zero because
  // the bracket is on the same line as the (now-gone) item.
  const isMultilineInlineContainer =
    (isInlineTable(parent) || isInlineArray(parent)) &&
    parent.loc.end.line > parent.loc.start.line;

  if (
    previous === undefined &&
    next === undefined &&
    !isMultilineInlineContainer
  ) {
    offset.lines = 0;
    offset.columns = 0;
  }

  // Offset for comma and remove comma that appear in front of the element (if-needed)
  if (is_inline && previous_on_same_line) {
    offset.columns -= 2;
  }

  // If first element in array/inline-table, remove space for comma and space after element.
  // For single-line inline containers the next item shifts left to fill the gap.
  // For multiline (perLine) containers items live on their own lines, so no column
  // adjustment is needed — and applying one would corrupt the column tracking for
  // any root-level node (e.g. an extracted comment) that lands on the opening-brace line.
  if (is_inline && !previous && next) {
    if (!perLine(parent as InlineArray)) {
      offset.columns -= 2;
    }
  }

  if (is_inline && previous && !next) {
    // When removing the last element, preserve trailing comma preference
    // If the removed element had a trailing comma, transfer it to the new last element
    const removedHadTrailingComma = (node as InlineArrayItem | InlineTableItem).comma;
    if (removedHadTrailingComma) {
      (previous as InlineArrayItem | InlineTableItem).comma = true;
    } else {
      (previous as InlineArrayItem | InlineTableItem).comma = false;
    }
  }

  // Apply offsets after preceding node or before remaining siblings.
  //
  // When the first item of a Table or TableArray is removed, we must NOT place
  // the enter offset on the parent — that would shift the table's key header
  // (which is visited before the items) by the removal offset, corrupting
  // its position (e.g. shifting it to line 0).  Instead, place the offset as
  // an EXIT offset on the parent's key: the key itself is processed first
  // (unaffected), and the offset takes effect for the subsequently visited items.
  let target: TreeNode;
  let target_offsets: WeakMap<TreeNode, { lines: number; columns: number }>;

  if (previous) {
    target = previous;
    target_offsets = getExitOffsets(root);
  } else if ((isTable(parent) || isTableArray(parent)) && 'key' in parent) {
    target = (parent as Table | TableArray).key;
    target_offsets = getExitOffsets(root);
  } else {
    target = parent;
    target_offsets = getEnterOffsets(root);
  }
  const node_offsets = getExitOffsets(root);
  const previous_offset = target_offsets.get(target);
  if (previous_offset) {
    offset.lines += previous_offset.lines;
    offset.columns += previous_offset.columns;
  }
  const removed_offset = node_offsets.get(node);
  if (removed_offset) {
    offset.lines += removed_offset.lines;
    offset.columns += removed_offset.columns;
  }

  target_offsets.set(target, offset);
  dirty_roots.add(root);

  // Handle orphaned comments for multiline inline tables.
  //
  // When a TOML 1.1 multiline inline table is parsed, comments inside it are emitted into
  // root.items (the Document/Table level) rather than into InlineTable.items. The line-count
  // offset placed above (on `target`) bleeds through the rest of the Document traversal in
  // applyWrites, shifting every subsequent root-level item by `offset.lines`. That is correct
  // for comments AFTER the deleted line (they should shift up), but wrong for comments BEFORE
  // the deleted line (they must stay put), and comments ON the deleted line must be removed.
  //
  // Fix: for root-level comments that sit before the removed line, pre-shift them in the
  // opposite direction so that the bleedthrough restores them to their original position.
  // Comments on the deleted line are removed from root.items entirely.
  //
  // Scope: only multiline inline tables. For single-line inline tables the parser does NOT
  // extract comments into root — any comment after `{ ... }` on the same line stays as a
  // root-level item but is NOT associated with the inline table's items, so the
  // `commentLine === removedLine` drop would incorrectly delete it.
  if (isMultilineInlineContainer && hasItems(root) && root !== parent) {
    const removedLine = node.loc.start.line;
    const rootItems = (root as WithItems).items;
    const toRemove: number[] = [];

    for (let i = 0; i < rootItems.length; i++) {
      const item = rootItems[i];
      if (!isComment(item)) continue;
      const commentLine = (item as Comment).loc.start.line;
      if (commentLine === removedLine) {
        // Comment was on the same line as the removed item — drop it.
        toRemove.push(i);
      } else if (offset.lines !== 0 && commentLine < removedLine) {
        // Comment is before the removed line: pre-compensate so the bleedthrough
        // offset applied during applyWrites leaves it at its original position.
        (item as Comment).loc.start.line -= offset.lines;
        (item as Comment).loc.end.line -= offset.lines;
      }
      // Comments after removedLine: bleedthrough is already the correct shift.
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      rootItems.splice(toRemove[i], 1);
    }
  }
}

export function applyBracketSpacing(
  root: Root,
  node: InlineArray | InlineTable,
  bracket_spacing: boolean = true
) {
  // Can only add bracket spacing currently
  if (!bracket_spacing) return;
  if (!node.items.length) return;

  // Apply enter to node so that items are affected
  addOffset({ lines: 0, columns: 1 }, getEnterOffsets(root), node);

  // Apply exit to last node in items
  const last_item = last(node.items as TreeNode[])!;
  addOffset({ lines: 0, columns: 1 }, getExitOffsets(root), last_item);
  dirty_roots.add(root);
}

export function applyTrailingComma(
  root: Root,
  node: InlineArray | InlineTable,
  trailing_commas: boolean = false
) {
  // Can only add trailing comma currently
  if (!trailing_commas) return;
  if (!node.items.length) return;

  const last_item = last(node.items)!;
  last_item.comma = true;

  addOffset({ lines: 0, columns: 1 }, getExitOffsets(root), last_item);
  dirty_roots.add(root);
}

/**
 * Applies all accumulated write offsets (enter and exit) to the given CST node.
 * This function adjusts the start and end locations of each node in the tree based on
 * the offsets stored in the `enter` and `exit` maps. It ensures that the tree's location
 * data is consistent after modifications.
 *
 * @param root - The root node of the CST tree to which the write offsets will be applied.
 */
export function applyWrites(root: TreeNode) {
  if (!dirty_roots.has(root)) return;

  const enter = getEnterOffsets(root);
  const exit = getExitOffsets(root);

  let offsetLines = 0;
  const offsetColumns: { [index: number]: number } = {};

  // Inline shift helpers — access loc directly to keep V8 ICs monomorphic
  // (the generic traverse version passes many node shapes through the same
  //  function, causing megamorphic inline caches)

  // After all children have been visited and their positions updated, recalculate
  // the container's end position as the max of all its children's ends.
  //
  // This is necessary because the offset-based shiftEnd approach can produce wrong
  // container ends when a block-level child is removed: the column offset for the
  // removed line bleeds into the previous sibling's line after the line-count shift,
  // causing the container end to shrink below its remaining children.
  function recalcContainerEnd(container: Document | Table | TableArray) {
    let endLine = container.loc.start.line;
    let endCol  = container.loc.start.column;

    // Include the key for Table and TableArray
    if ('key' in container) {
      const ke = (container as Table | TableArray).key.loc.end;
      if (ke.line > endLine || (ke.line === endLine && ke.column > endCol)) {
        endLine = ke.line;
        endCol  = ke.column;
      }
    }

    for (let i = 0; i < container.items.length; i++) {
      const e = container.items[i].loc.end;
      if (e.line > endLine || (e.line === endLine && e.column > endCol)) {
        endLine = e.line;
        endCol  = e.column;
      }
    }

    container.loc.end = { line: endLine, column: endCol };
  }

  function visitNode(node: TreeNode) {
    switch (node.type) {
      case NodeType.Document: {
        const doc = node as Document;
        shiftLoc(doc);
        for (let i = 0; i < doc.items.length; i++) visitNode(doc.items[i]);
        shiftEnd(doc);
        recalcContainerEnd(doc);
        break;
      }
      case NodeType.Table: {
        const tbl = node as Table;
        shiftLoc(tbl);
        visitNode(tbl.key);
        for (let i = 0; i < tbl.items.length; i++) visitNode(tbl.items[i]);
        shiftEnd(tbl);
        recalcContainerEnd(tbl);
        break;
      }
      case NodeType.TableArray: {
        const ta = node as TableArray;
        shiftLoc(ta);
        visitNode(ta.key);
        for (let i = 0; i < ta.items.length; i++) visitNode(ta.items[i]);
        shiftEnd(ta);
        recalcContainerEnd(ta);
        break;
      }
      case NodeType.TableKey: {
        const tk = node as TableKey;
        shiftLoc(tk);
        visitNode(tk.item);
        shiftEnd(tk);
        break;
      }
      case NodeType.TableArrayKey: {
        const tak = node as TableArrayKey;
        shiftLoc(tak);
        visitNode(tak.item);
        shiftEnd(tak);
        break;
      }
      case NodeType.KeyValue: {
        const kv = node as KeyValue;
        // Special enter: adjust equals position before shifting
        const startLine = kv.loc.start.line + offsetLines;
        const keyExit = exit.get(kv.key);
        kv.equals += (offsetColumns[startLine] || 0) + (keyExit ? keyExit.columns : 0);
        shiftLoc(kv);
        // Children
        visitNode(kv.key);
        visitNode(kv.value);
        shiftEnd(kv);
        break;
      }
      case NodeType.InlineArray: {
        const ia = node as InlineArray;
        shiftLoc(ia);
        for (let i = 0; i < ia.items.length; i++) visitNode(ia.items[i]);
        shiftEnd(ia);
        break;
      }
      case NodeType.InlineTable: {
        const it = node as InlineTable;
        shiftLoc(it);
        for (let i = 0; i < it.items.length; i++) visitNode(it.items[i]);
        shiftEnd(it);
        break;
      }
      case NodeType.InlineItem: {
        const ii = node as InlineItem;
        shiftLoc(ii);
        visitNode(ii.item);
        shiftEnd(ii);
        break;
      }
      // Leaf nodes — no children
      case NodeType.Key:
      case NodeType.String:
      case NodeType.Integer:
      case NodeType.Float:
      case NodeType.Boolean:
      case NodeType.DateTime:
      case NodeType.Comment:
        shiftLoc(node);
        shiftEnd(node);
        break;
      default:
        throw new Error(`Unrecognized node type "${(node as any).type}"`);
    }
  }

  function shiftLoc(node: TreeNode) {
    node.loc.start.line += offsetLines;
    const colOff = offsetColumns[node.loc.start.line] || 0;
    node.loc.start.column += colOff;

    const entering = enter.get(node);
    if (entering) {
      offsetLines += entering.lines;
      offsetColumns[node.loc.start.line] =
        (offsetColumns[node.loc.start.line] || 0) + entering.columns;
    }
  }

  function shiftEnd(node: TreeNode) {
    node.loc.end.line += offsetLines;
    const colOff = offsetColumns[node.loc.end.line] || 0;
    node.loc.end.column += colOff;

    const exiting = exit.get(node);
    if (exiting) {
      offsetLines += exiting.lines;
      offsetColumns[node.loc.end.line] =
        (offsetColumns[node.loc.end.line] || 0) + exiting.columns;
    }
  }

  visitNode(root);

  // Mark as clean and clear offset maps only after successful traversal
  dirty_roots.delete(root);
  enter_offsets.delete(root);
  exit_offsets.delete(root);
}

export function shiftNode(
  node: TreeNode,
  span: Span,
  options: { first_line_only?: boolean } = {}
): TreeNode {
  const { lines, columns } = span;

  // Early return for no-op shifts
  if (lines === 0 && columns === 0) return node;

  const { first_line_only = false } = options;
  const start_line = node.loc.start.line;

  // Fast path for leaf nodes (no children to traverse)
  const type = node.type;
  if (type === NodeType.Key || type === NodeType.String ||
      type === NodeType.Integer || type === NodeType.Float ||
      type === NodeType.Boolean || type === NodeType.DateTime ||
      type === NodeType.Comment) {
    if (!first_line_only || node.loc.start.line === start_line) {
      node.loc.start.column += columns;
      // Only shift end.column when start and end are on the same line.
      // For multiline strings the end is on a completely different line, so its
      // column is an absolute position independent of where the node starts.
      if (node.loc.end.line === node.loc.start.line) {
        node.loc.end.column += columns;
      }
    }
    node.loc.start.line += lines;
    node.loc.end.line += lines;
    return node;
  }

  // Fast path for KeyValue with a leaf value (most common case in stringify).
  // Handles KeyValue → Key → leaf without function call / switch overhead.
  if (type === NodeType.KeyValue) {
    const kv = node as KeyValue;
    const valType = kv.value.type;
    if (valType === NodeType.String || valType === NodeType.Integer ||
        valType === NodeType.Float || valType === NodeType.Boolean ||
        valType === NodeType.DateTime) {
      // Move KeyValue
      if (!first_line_only || kv.loc.start.line === start_line) {
        kv.loc.start.column += columns;
        kv.loc.end.column += columns;
      }
      kv.loc.start.line += lines;
      kv.loc.end.line += lines;
      kv.equals += columns;
      // Move Key
      const key = kv.key;
      if (!first_line_only || key.loc.start.line === start_line) {
        key.loc.start.column += columns;
        key.loc.end.column += columns;
      }
      key.loc.start.line += lines;
      key.loc.end.line += lines;
      // Move leaf Value
      const val = kv.value;
      if (!first_line_only || val.loc.start.line === start_line) {
        val.loc.start.column += columns;
        val.loc.end.column += columns;
      }
      val.loc.start.line += lines;
      val.loc.end.line += lines;
      return node;
    }
  }

  // Generic path: full traverse for complex nodes
  const move = (node: TreeNode) => {
    if (!first_line_only || node.loc.start.line === start_line) {
      node.loc.start.column += columns;
      node.loc.end.column += columns;
    }
    node.loc.start.line += lines;
    node.loc.end.line += lines;
  };

  traverse(node, {
    [NodeType.Table]: move,
    [NodeType.TableKey]: move,
    [NodeType.TableArray]: move,
    [NodeType.TableArrayKey]: move,
    [NodeType.KeyValue](node) {
      move(node);
      node.equals += columns;
    },
    [NodeType.Key]: move,
    [NodeType.String]: move,
    [NodeType.Integer]: move,
    [NodeType.Float]: move,
    [NodeType.Boolean]: move,
    [NodeType.DateTime]: move,
    [NodeType.InlineArray]: move,
    [NodeType.InlineItem]: move,
    [NodeType.InlineTable]: move,
    [NodeType.Comment]: move
  });

  return node;
}

function perLine(array: InlineArray | InlineTable): boolean {
  if (!array.items.length) return false;

  const span = getSpan(array.loc);
  return span.lines > array.items.length;
}

function addOffset(offset: Span, offsets: Offsets, node: TreeNode, from?: TreeNode) {
  const previous_offset = offsets.get(from || node);
  if (previous_offset) {
    offset.lines += previous_offset.lines;
    offset.columns += previous_offset.columns;
  }

  offsets.set(node, offset);
}
