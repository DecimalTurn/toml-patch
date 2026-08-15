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
} from './cst';
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

// Roots being built by parseJS (stringify path, not patch).
// These never contain Comment nodes, never have items removed, and
// inserts are always sequential — letting us skip patch-only code paths.
const stringifyRoots: WeakSet<Root> = new WeakSet();

/** Mark a root as being built by parseJS — enables stringify fast paths. */
export function markStringifyRoot(root: Root): void {
  stringifyRoots.add(root);
}

// Track Tables/TableArrays whose last item was removed via remove().
// Also track whether a non-last removal occurred (multiple items removed).
const emptiedByRemove: WeakMap<TreeNode, boolean> = new WeakMap();
const hadNonLastRemoval: WeakSet<TreeNode> = new WeakSet();

// Track single-line InlineTables and InlineArrays whose only item was
// removed, so the caller can tighten the closing bracket and reapply
// bracket spacing.
const inlineContainersNeedingTighten: WeakSet<TreeNode> = new WeakSet();
export function hasInlineContainerNeedingTighten(node: TreeNode): boolean {
  return inlineContainersNeedingTighten.has(node);
}
export function deleteInlineContainerNeedingTighten(node: TreeNode): void {
  inlineContainersNeedingTighten.delete(node);
}

/**
 * Add an exit offset at `node` so that applyWrites shifts everything
 * after the node in depth-first order by `span`.  Used by key-truncation
 * in the Edit handler to account for a shortened key without having to
 * manually adjust every downstream position.
 */
export function addExitOffset(root: Root, node: TreeNode, span: Span): void {
  addOffset(span, getExitOffsets(root), node);
}

/** Marks a root so the next applyWrites() walk actually processes it. */
export function markDirty(root: Root): void {
  dirty_roots.add(root);
}

const enter_offsets: WeakMap<Root, Offsets> = new WeakMap();
const getEnterOffsets = (root: Root) => {
  if (!enter_offsets.has(root)) {
    enter_offsets.set(root, new WeakMap());
  }
  return enter_offsets.get(root)!;
};
/**
 * The pending enter-offset map for a root.  Exposed so callers can detect a
 * block container that still carries a removal's enter offset before
 * inserting at index 0 (fuzz seed 11557: the new row was dragged above
 * line 1 by the unresolved removal shift).
 */
export function getPendingEnterOffsets(root: Root): Offsets {
  return enter_offsets.has(root) ? enter_offsets.get(root)! : new WeakMap();
}

const exit_offsets: WeakMap<Root, Offsets> = new WeakMap();
/**
 * The pending exit-offset map for a root.  Exposed so moveInlineElement can
 * cancel a removal's offset before it leaks past the container (fuzz seed 900).
 */
export function getExitOffsets(root: Root): Offsets {
  if (!exit_offsets.has(root)) {
    exit_offsets.set(root, new WeakMap());
  }
  return exit_offsets.get(root)!;
}

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
export function insert(root: Root, parent: TreeNode, child: TreeNode, index?: number, forceInline?: boolean, hostItems?: TreeNode[], leadingLines?: number) {
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
      root,
      parent as Document | Table | TableArray,
      child as KeyValue | Comment,
      index,
      leadingLines
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

  // Handle orphaned comments for multiline inline table/array inserts (analogous to the
  // remove case below). When a new item is added on a new line inside a multiline inline
  // table or array, the exit offset on the inserted child bleeds to comments that were
  // extracted from inside the container into the enclosing Document/Table's own
  // items (`hostItems` — defaults to `root.items`, correct only when the inline container
  // is itself root-level; pass the real enclosing container's `.items` otherwise).
  // Pre-compensate comments that appear before the insertion line so the bleedthrough
  // leaves them at their original position.
  //
  // Bounded to comments physically within `parent`'s own line span: `hostItems` (be it
  // root.items or a nested host container's items) can hold many OTHER comments with no
  // relation to this inline container at all (prose between sibling keys, another key's own
  // trailing comment) — blindly shifting every comment in that array by line number alone
  // corrupts unrelated ones the moment a document has more than the hoisted comments in it.
  if ((isInlineTable(parent) || isInlineArray(parent)) && offset.lines !== 0 && (hostItems || hasItems(root)) && root !== parent) {
    const insertionLine = child.loc.start.line;
    const commentHostItems = hostItems ?? (root as WithItems).items;
    for (let i = 0; i < commentHostItems.length; i++) {
      const item = commentHostItems[i];
      if (!isComment(item)) continue;
      const commentLine = (item as Comment).loc.start.line;
      if (commentLine < parent.loc.start.line || commentLine > parent.loc.end.line) continue;
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
  root: Root,
  parent: Document | Table | TableArray,
  child: Block,
  index: number,
  leadingLinesOverride?: number
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

  // Set start location from the item with the furthest end position among
  // all preceding items (up to index). This handles extracted comments that
  // appear after a KeyValue in the items array but are physically positioned
  // before the KeyValue's closing bracket in the source.
  //
  // Fast path: when the root is a stringify root (parseJS, no comments),
  // the immediate predecessor is the furthest — skip all scanning.
  let furthestPrevious: TreeNode | undefined;
  if (previous !== undefined) {
    if (stringifyRoots.has(root)) {
      furthestPrevious = previous;
    } else {
      let hasComment = false;
      for (let i = 0; i < index; i++) {
        if (isComment(parent.items[i])) { hasComment = true; break; }
      }
      if (!hasComment) {
        furthestPrevious = previous;
      } else {
        let maxEndLine = -1;
        let maxEndColumn = -1;
        for (let i = 0; i < index; i++) {
          const item = parent.items[i];
          const end = item.loc.end;
          if (end.line > maxEndLine || (end.line === maxEndLine && end.column > maxEndColumn)) {
            maxEndLine = end.line;
            maxEndColumn = end.column;
            furthestPrevious = item;
          }
        }
      }
    }
  }

  const start = furthestPrevious
    ? {
      line: furthestPrevious.loc.end.line,
      column: !isComment(furthestPrevious) ? furthestPrevious.loc.start.column : parent.loc.start.column
    }
    : clonePosition(parent.loc.start);
  
  const isSquareBracketsStructure = isTable(child) || isTableArray(child);
  let leading_lines = 0;
  if (leadingLinesOverride !== undefined) {
    leading_lines = leadingLinesOverride;
  } else if (use_first_line || prepend_to_document) {
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
  //
  // When inserting the first item into a Table/TableArray that was previously
  // emptied by remove(), decide based on whether multiple items were removed:
  // - Single item: skip the extra blank line (the original separator is intact).
  // - Multiple items: use normal offset (compensates accumulated removal shifts).
  // Track empty/multi-removal state — only needed during patching.
  const wasEmptied = !stringifyRoots.has(root) && previous === undefined
    && (isTable(parent) || isTableArray(parent) || isDocument(parent))
    && emptiedByRemove.has(parent);
  const wasSingleRemoval = wasEmptied && !hadNonLastRemoval.has(parent);
  if (wasEmptied) {
    emptiedByRemove.delete(parent);
    hadNonLastRemoval.delete(parent);
  }

  // When multiple items were removed from a table (or the document root),
  // the accumulated removal offset still sits on the parent's key (Table/
  // TableArray) or on the parent itself (Document) and will shift this new
  // child during applyWrites. Cancel it out exactly by shifting the child
  // the opposite amount, rather than assuming a fixed one-line offset. Also
  // skip the blank-line offset (like the single-removal case) to avoid
  // doubled blank lines.
  const needsCompensation = wasEmptied && !wasSingleRemoval;
  let compensation_lines = 0;
  if (needsCompensation) {
    const staleOffset = (isTable(parent) || isTableArray(parent))
      ? getExitOffsets(root).get((parent as Table | TableArray).key)
      : getEnterOffsets(root).get(parent);
    compensation_lines = staleOffset ? -staleOffset.lines : 1;
  }
  const offset_leading = (wasSingleRemoval || needsCompensation) ? -child_span.lines : (leading_lines - 1);
  const offset_lines = prepend_to_document
    ? child_span.lines + 1
    : child_span.lines + offset_leading;
  const offset = {
    lines: offset_lines,
    columns: child_span.columns
  };

  return { shift: { lines: shift.lines + compensation_lines, columns: shift.columns }, offset };
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

  // With no previous sibling to line up against, the fallback above is the parent's own
  // opening bracket. On one line that is right, but in a multi-line container the bracket
  // sits at the end of `key = [` — nowhere near where the rows are indented, so a new first
  // row would land under the bracket instead of level with its siblings. Match the row that
  // will follow it instead (skipping comments, whose column is not the row indent).
  //
  // `i > index` rather than `>=`: insertInline() splices `child` in before calling this, so
  // `parent.items[index]` is `child` itself and `>=` would measure the new row against its
  // own pre-shift column. The other caller, insertInlineAtRoot(), splices afterwards but
  // passes useNewLine: false, so it never reaches here.
  if (!previous && useNewLine) {
    const following = (parent.items as TreeNode[]).find(
      (item, i) => i > index && !isComment(item)
    );
    if (following) start.column = following.loc.start.column;
  }

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
  const next = index != null ? parent.items[index] : undefined;

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

  // Use new line for arrays/tables that span multiple lines (one item per line).
  // A MULTILINE item (e.g. a multiline string) can end mid-line while the NEXT
  // item continues on that same line — a new-line insert would then land on
  // the following row, inside whatever occupies it (fuzz seed 620: inserting
  // after a multiline string dropped the new item into the next row's nested
  // array).  The same hazard exists for a SINGLE-line previous item when the
  // container is shared-line: `previous` and `next` sit on one row while the
  // container's span is inflated by a trailing multiline nested array, so a
  // new-line insert shifts the tail and the move's realignment collapses that
  // nested array (fuzz seed 68861).  In both cases stay on the same line as
  // the previous item.
  //
  // The sibling locs must look settled before trusting them: during comment
  // realignment / removal re-inserts `next` can start INSIDE the previous
  // item's span (pending offsets not yet applied) — treating that as
  // "same line" corrupts the insert (fuzz seed 203).
  const use_new_line = perLine(parent) && !(
    previous && next &&
    next.loc.start.line === previous.loc.end.line &&
    next.loc.start.column >= previous.loc.end.column
  ) && !(
    // Inserting at the end while the closing brace shares the last row's
    // line: a new-line insert would start one line PAST the brace and emit
    // the new row outside the table (`}  k = 1` — fuzz seed 3632).  Stay
    // on the last row's line instead; the exit offset then pushes the
    // brace down a line.
    !next && previous &&
    previous.loc.end.line === parent.loc.end.line
  );
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

export function remove(root: Root, parent: TreeNode, node: TreeNode, hostItems?: TreeNode[]) {
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
  // `node.loc.start.line` can be stale when `previous` carries a pending exit
  // offset (e.g. an earlier Edit collapsed a multiline item, leaving a line
  // offset that will pull this node up a line in applyWrites).  Compensate so
  // a same-line removal is recognised as such instead of as a full-line
  // removal that shifts the container's closing bracket onto the wrong line
  // (fuzz seed 54607).
  const prevPendingExit = previous ? getExitOffsets(root).get(previous) : undefined;
  const previous_on_same_line = previous &&
    previous.loc.end.line === (node.loc.start.line + (prevPendingExit?.lines ?? 0));
  const next_on_sameLine = next && next.loc.start.line === node.loc.end.line;
  const keep_line = is_inline && (previous_on_same_line || next_on_sameLine);

  const offset = {
    lines: -(removed_span.lines - (keep_line ? 1 : 0)),
    // Column offsets only apply when removing inline content on the same line.
    // For block-level removals (entire lines removed), subsequent items on
    // different lines need no column adjustment — only a line shift.
    columns: keep_line ? -removed_span.columns : 0
  };

  // A node's span covers the lines it occupies but not the blank line above it, and
  // insertOnNewLine gives a [table]/[[array]] exactly such a separator when placing one
  // (leading_lines = 2). Shifting by the span alone therefore stranded it, so deleting
  // sections one at a time accumulated blank lines.
  //
  // Reclaim it, but only the separator the removed node itself owned. The gap *below* the
  // node belongs to whatever follows — a section carries its own leading blank and must keep
  // it, which is why this cannot simply close the distance to `next`.
  //
  // Skipped when `next` does not genuinely begin below the removed node: a comment hoisted
  // out of a multi-line inline container is filed as a sibling but keeps a loc pointing
  // *inside* the braces, so it can sit within the removed node's own span.
  const isBlockContainer = isDocument(parent) || isTable(parent) || isTableArray(parent);
  if (isBlockContainer && next && !keep_line && next.loc.start.line > node.loc.end.line) {
    const removedIsSection = isTable(node) || isTableArray(node);
    const nextIsSection = isTable(next) || isTableArray(next);

    // `previous` is the preceding sibling in items order, which is not necessarily the
    // furthest one physically: a comment hoisted out of a multi-line inline container is
    // filed after the key-value it came from while keeping a loc pointing *inside* the
    // braces. Measuring from it would count the container's own body as blank space and
    // pull `next` up over the closing brace. Take the furthest end line instead, the same
    // anchor insertOnNewLine picks.
    let precedingEndLine = -1;
    for (let i = 0; i < index; i++) {
      const end = parent.items[i].loc.end.line;
      if (end > precedingEndLine) precedingEndLine = end;
    }

    // When `previous` already has a pending exit offset (from a prior removal
    // in the same applyChanges batch), `node.loc.start.line` is stale — it
    // hasn't been shifted yet by that offset.  The whole point of extra is to
    // measure the physical gap between the furthest preceding item and this
    // section's header, so it must use the post-offset position of `node`.
    // Compensate by adding the pending offset (which is always negative for
    // removals) to `node.loc.start.line` so the gap computation isn't inflated
    // by lines that were already accounted for.
    const prevPendingExit = previous ? getExitOffsets(root).get(previous) : undefined;
    // The removed node itself can also carry a pending exit offset (from an
    // earlier removal in the same applyChanges batch).  In the "nothing
    // above" branch, `next.loc.start.line` has not been shifted by it yet, so
    // measuring the gap from the pre-offset position double-counts lines the
    // earlier removal already reclaimed and pulls `next` up onto the wrong
    // line (fuzz seed 65785).
    const nodePendingExit = getExitOffsets(root).get(node);
    const extra = previous
      // Only a section carries a leading separator, so only removing one frees a blank line.
      // A key-value sits flush against the line above and frees nothing extra.
      ? (removedIsSection ? (node.loc.start.line + (prevPendingExit?.lines ?? 0)) - precedingEndLine - 1 : 0)
      // Nothing above: `next` is pulled to the top of the container, where the separator it
      // was carrying becomes a spurious leading blank.
      : (nextIsSection ? (next.loc.start.line + (nodePendingExit?.lines ?? 0)) - node.loc.end.line - 1 : 0);
    if (extra > 0) offset.lines -= extra;
  }

  // If there is nothing left, don't perform any offsets.
  //
  // Exception: multiline inline containers (InlineTable / InlineArray whose opening
  // and closing brackets are on different lines).  For those, `offset.lines` must
  // stay intact so that `applyWrites` shifts the closing bracket up to close the
  // gap left by the removed item.  Single-line containers are fine to zero because
  // the bracket is on the same line as the (now-gone) item.
  //
  // Further exception: when the removed item STARTED on the container's own
  // bracket line (the first item of a multiline inline container), the item's
  // inclusive span counts that shared line too — shifting by the full span
  // would drag the closing bracket ABOVE the container and into the previous
  // row (fuzz seed 5522: `ecq = ["""…"""]` emptied, the bracket escaped into
  // the preceding key-value).  Zero it like the single-line case and let the
  // caller tighten the emptied container to `[]`/`{}`.
  const isMultilineInlineContainer =
    (isInlineTable(parent) || isInlineArray(parent)) &&
    parent.loc.end.line > parent.loc.start.line;
  const emptiedFromContainerLine =
    isMultilineInlineContainer &&
    node.loc.start.line === parent.loc.start.line;

  if (
    previous === undefined &&
    next === undefined &&
    (!isMultilineInlineContainer || emptiedFromContainerLine)
  ) {
    offset.lines = 0;
    offset.columns = 0;

    // When the only item is removed from a single-line InlineTable or
    // InlineArray, mark it so the caller can tighten the closing bracket
    // later. The exit offset that carried the bracket spacing was on the
    // removed item and is now lost.  Multiline containers whose only item
    // started on the bracket line are marked too (see above).
    if (isInlineTable(parent) || isInlineArray(parent)) {
      inlineContainersNeedingTighten.add(parent);
    }

    // When a Table, TableArray, or the root Document becomes completely
    // empty, mark it.
    if (isTable(parent) || isTableArray(parent) || isDocument(parent)) {
      emptiedByRemove.set(parent, true);
    }
  }

  // Track non-last removals from Tables/TableArrays/Document so insertOnNewLine
  // knows whether multiple items were removed (needs compensation).
  if (!(previous === undefined && next === undefined)
      && (isTable(parent) || isTableArray(parent) || isDocument(parent))) {
    hadNonLastRemoval.add(parent);
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

    // The container's closing bracket moves to right after the REMAINING
    // previous item, so the column shift is the end-to-end gap — not the
    // removed item's width, which is wrong when the previous item is
    // multiline and ends AFTER the removed item's stale start (fuzz seed
    // 706: the bracket slid inside the preceding nested array).
    //
    // When `previous` carries a pending exit offset (e.g. it was just
    // replaced by an Edit in the same applyChanges batch), `node.loc.end`
    // is still pre-shift — the raw gap measures across the stale distance.
    // Compensate with the pending column shift so the bracket lands right
    // after the surviving item (fuzz seed 12237: a nested array edit plus
    // a last-item removal spliced `,false,b` into a neighbouring string).
    if (previous_on_same_line) {
      const pendingPrevColumns = previous ? (getExitOffsets(root).get(previous)?.columns ?? 0) : 0;
      offset.columns = previous.loc.end.column - node.loc.end.column - pendingPrevColumns;
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
    // Column offsets only matter when the removed node shared its line with
    // following inline content.  Folding them into a block-level removal
    // shifts whole subsequent lines sideways — e.g. moving a freshly
    // replaced Table (which carries replace()'s column delta) to the end of
    // the document indented the next root KV by the table's width (fuzz
    // seed 590).
    if (keep_line) offset.columns += removed_offset.columns;
  }

  target_offsets.set(target, offset);
  dirty_roots.add(root);

  // Handle orphaned comments for multiline inline tables/arrays.
  //
  // When a TOML 1.1 multiline inline container is parsed, comments inside it are emitted into
  // the enclosing Document/Table's own items (`hostItems` — the container whose `.items` the
  // parser actually filed them under, which is `root.items` only when the inline container is
  // itself a ROOT-level key; a nested `[table]`'s array instead files them into that Table's
  // own items) rather than into the InlineTable/InlineArray's own items. The line-count offset
  // placed above (on `target`) bleeds through the rest of that container's traversal in
  // applyWrites, shifting every subsequent sibling item by `offset.lines`. That is correct for
  // comments AFTER the deleted line (they should shift up), but wrong for comments BEFORE the
  // deleted line (they must stay put), and comments ON the deleted line must be removed.
  //
  // Fix: for host-level comments that sit before the removed line, pre-shift them in the
  // opposite direction so that the bleedthrough restores them to their original position.
  // Comments on the deleted line are removed from `hostItems` entirely.
  //
  // `hostItems` defaults to `root.items` (the historical behavior, correct only when the
  // inline container is root-level); callers that know the real enclosing container — e.g.
  // comment-ownership.ts's findHostContainer() — should pass its `.items` explicitly so this
  // scans the array the comments actually live in, not always literally the document root.
  //
  // Scope: only multiline inline tables. For single-line inline tables the parser does NOT
  // extract comments into the host — any comment after `{ ... }` on the same line stays as a
  // host-level item but is NOT associated with the inline table's items, so the
  // `commentLine === removedLine` drop would incorrectly delete it.
  //
  // Bounded to comments physically within `parent`'s own line span — see the identical note
  // on the insert() side above; `hostItems` can hold many comments with no relation to this
  // specific inline container at all.
  if (isMultilineInlineContainer && (hostItems || hasItems(root)) && root !== parent) {
    const removedLine = node.loc.start.line;
    const commentHostItems = hostItems ?? (root as WithItems).items;
    const toRemove: number[] = [];

    for (let i = 0; i < commentHostItems.length; i++) {
      const item = commentHostItems[i];
      if (!isComment(item)) continue;
      const commentLine = (item as Comment).loc.start.line;
      if (commentLine < parent.loc.start.line || commentLine > parent.loc.end.line) continue;
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
      commentHostItems.splice(toRemove[i], 1);
    }
  }
}

/**
 * Recalculates a container's end position as the max of its key (for Table/
 * TableArray) and all its children's ends. Necessary because the offset-based
 * shiftEnd approach can produce wrong container ends when a block-level child
 * is removed: the column offset for the removed line bleeds into the previous
 * sibling's line after the line-count shift, causing the container end to
 * shrink below its remaining children.
 */
export function recalcContainerEnd(container: Document | Table | TableArray) {
  let endLine = container.loc.start.line;
  let endCol = container.loc.start.column;

  // Include the key for Table and TableArray
  if ('key' in container) {
    const ke = (container as Table | TableArray).key.loc.end;
    if (ke.line > endLine || (ke.line === endLine && ke.column > endCol)) {
      endLine = ke.line;
      endCol = ke.column;
    }
  }

  for (let i = 0; i < container.items.length; i++) {
    const e = container.items[i].loc.end;
    if (e.line > endLine || (e.line === endLine && e.column > endCol)) {
      endLine = e.line;
      endCol = e.column;
    }
  }

  container.loc.end = { line: endLine, column: endCol };
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
        // Fast path: no offsets on this subtree — skip WeakMap lookups.
        if (!enter.get(ia) && !exit.get(ia)) {
          shiftPositionsNoOffsets(ia);
          for (let i = 0; i < ia.items.length; i++) visitNode(ia.items[i]);
          shiftPositionsNoOffsetsEnd(ia);
          break;
        }
        shiftLoc(ia);
        for (let i = 0; i < ia.items.length; i++) visitNode(ia.items[i]);
        shiftEnd(ia);
        break;
      }
      case NodeType.InlineTable: {
        const it = node as InlineTable;
        if (!enter.get(it) && !exit.get(it)) {
          shiftPositionsNoOffsets(it);
          for (let i = 0; i < it.items.length; i++) visitNode(it.items[i]);
          shiftPositionsNoOffsetsEnd(it);
          break;
        }
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

  // Simplified shift helpers for clean subtrees — apply accumulated
  // offsets without checking for enter/exit offsets (there are none).
  function shiftPositionsNoOffsets(node: TreeNode) {
    node.loc.start.line += offsetLines;
    node.loc.start.column += (offsetColumns[node.loc.start.line] || 0);
  }

  function shiftPositionsNoOffsetsEnd(node: TreeNode) {
    node.loc.end.line += offsetLines;
    node.loc.end.column += (offsetColumns[node.loc.end.line] || 0);
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
        // Same-line guard: a multiline string value puts the KV's end on a
        // different line, whose column must not move with the start.
        if (kv.loc.end.line === kv.loc.start.line) {
          kv.loc.end.column += columns;
        }
      }
      kv.loc.start.line += lines;
      kv.loc.end.line += lines;
      if (!first_line_only || kv.loc.start.line === start_line) {
        kv.equals += columns;
      }
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
        if (val.loc.end.line === val.loc.start.line) {
          val.loc.end.column += columns;
        }
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
      // Only shift end.column when start and end are on the same line:
      // for a multi-line node the end is on a completely different line and
      // its column is an absolute position independent of the start line.
      if (node.loc.end.line === node.loc.start.line) {
        node.loc.end.column += columns;
      }
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

export function perLine(array: InlineArray | InlineTable): boolean {
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
