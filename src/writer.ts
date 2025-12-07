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
  Table,
  KeyValue,
  Comment,
  InlineItem,
  isInlineItem,
  Block,
  isBlock
} from './ast';
import { Span, getSpan, clonePosition } from './location';
import { last } from './utils';
import traverse from './traverse';

////////////////////////////////////////
// The purpose of this file is to provide a way to modify the AST
////////////////////////////////////////

// Root node of the AST
export type Root = Document | TreeNode;

// Store line and column offsets per node
//
// Some offsets are applied on enter (e.g. shift child items and next items)
// Others are applied on exit (e.g. shift next items)
type Offsets = WeakMap<TreeNode, Span>;

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
      throw new Error(`Could not find existing item in parent node for replace`);
    }

    parent.items.splice(index, 1, replacement);

    // This next case is a special case for Inline-Table item
    // however due to the fact that both replacement of the whole Inline-Table and Inline-Table element will have the same parent,
    // we need to make sure it's not an Inline-Table 
  } else if (isKeyValue(parent) && isInlineTable(parent.value) && !isInlineTable(existing)) {
    
    const index = parent.value.items.indexOf(existing as InlineTableItem);
    if (index < 0) {
      throw new Error(`Could not find existing item in parent node for replace`);
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
}
/**
 * Inserts a child node into the AST.
 *
 * @param root - The root node of the AST
 * @param parent - The parent node to insert the child into
 * @param child - The child node to insert
 * @param index - The index at which to insert the child (optional)
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
    // Special case: when forcing inline behavior for Document,
    // calculate positioning as if inserting into an inline context
    ({ shift, offset } = calculateInlinePositioning(parent, child, index));
    
    // Insert the child directly into the Document (as a Block item)
    parent.items.splice(index, 0, child as KeyValue | Comment);
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

  const offsets = getExitOffsets(root);
  offsets.set(child, offset);
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
  if (use_first_line) {
    // 0 leading lines
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
  const offset = {
    lines: child_span.lines + (leading_lines - 1),
    columns: child_span.columns
  };

  return { shift, offset };
}

/**
 * Calculates positioning (shift and offset) for inserting a child into a parent container.
 * This function handles the core positioning logic used by both inline and document insertions.
 */
function calculatePositioning(
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
    } else if (hasSpacing) {
      start.column += skipBracketSpace;
    } else if (hasCommaHandling && !previous) {
      start.column += skipBracketSpace;
    } else if (!hasCommaHandling && previous) {
      start.column += skipBracketSpace; // Just a space for document inline spacing
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

  // HACK: Fix trailing comma spacing issue for arrays that have trailing commas
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

  // Use new line for inline arrays that span multiple lines
  const use_new_line = isInlineArray(parent) && perLine(parent);
  const has_trailing_comma = is_last && child.comma === true;

  return calculatePositioning(parent, child, index, {
    useNewLine: use_new_line,
    hasCommaHandling: true,
    isLastElement: is_last,
    hasSeparatingCommaBefore: has_separating_comma_before,
    hasSeparatingCommaAfter: has_separating_comma_after,
    hasTrailingComma: has_trailing_comma
  });
}

/**
 * Calculates positioning for inserting a child into a Document using inline spacing rules.
 * This function simulates inline positioning without actually modifying the parent or child.
 */
function calculateInlinePositioning(
  parent: Document,
  child: TreeNode,
  index: number
): { shift: Span; offset: Span } {
  return calculatePositioning(parent, child, index, {
    useNewLine: false,
    hasCommaHandling: false
  });
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
      throw new Error('Could not find node in parent for removal');
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
    columns: -removed_span.columns
  };

  // If there is nothing left, don't perform any offsets
  if(previous === undefined && next === undefined) {
    offset.lines = 0;
    offset.columns = 0;
  }

  // Offset for comma and remove comma that appear in front of the element (if-needed)
  if (is_inline && previous_on_same_line) {
    offset.columns -= 2;
  }

  // If first element in array/inline-table, remove space for comma and space after element
  if (is_inline && !previous && next) {
    offset.columns -= 2;
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

  // Apply offsets after preceding node or before children of parent node
  const target = previous || parent;
  const target_offsets = previous ? getExitOffsets(root) : getEnterOffsets(root);
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
}

/**
 * Applies all accumulated write offsets (enter and exit) to the given AST node.
 * This function adjusts the start and end locations of each node in the tree based on
 * the offsets stored in the `enter` and `exit` maps. It ensures that the tree's location
 * data is consistent after modifications.
 *
 * @param root - The root node of the AST tree to which the write offsets will be applied.
 */
export function applyWrites(root: TreeNode) {
  const enter = getEnterOffsets(root);
  const exit = getExitOffsets(root);

  const offset: { lines: number; columns: { [index: number]: number } } = {
    lines: 0,
    columns: {}
  };

  function shiftStart(node: TreeNode) {

    const lineOffset = offset.lines;
    node.loc.start.line += lineOffset;
    
    const columnOffset = offset.columns[node.loc.start.line] || 0;
    node.loc.start.column += columnOffset

    const entering = enter.get(node);
    if (entering) {
      offset.lines += entering.lines;
      offset.columns[node.loc.start.line] =
        (offset.columns[node.loc.start.line] || 0) + entering.columns;
    }
  }

  function shiftEnd(node: TreeNode) {

    const lineOffset = offset.lines;
    node.loc.end.line += lineOffset;
    
    const columnOffset = offset.columns[node.loc.end.line] || 0;
    node.loc.end.column += columnOffset;

    const exiting = exit.get(node);
    if (exiting) {
      offset.lines += exiting.lines;
      offset.columns[node.loc.end.line] =
        (offset.columns[node.loc.end.line] || 0) + exiting.columns;
    }
  }

  const shiftLocation = {
    enter: shiftStart,
    exit: shiftEnd
  };

  traverse(root, {
    [NodeType.Document]: shiftLocation,
    [NodeType.Table]: shiftLocation,
    [NodeType.TableArray]: shiftLocation,
    [NodeType.InlineTable]: shiftLocation,
    [NodeType.InlineArray]: shiftLocation,

    [NodeType.InlineItem]: shiftLocation,
    [NodeType.TableKey]: shiftLocation,
    [NodeType.TableArrayKey]: shiftLocation,

    [NodeType.KeyValue]: {
      enter(node) {
        const start_line = node.loc.start.line + offset.lines;
        const key_offset = exit.get(node.key);
        node.equals += (offset.columns[start_line] || 0) + (key_offset ? key_offset.columns : 0);

        shiftStart(node);
      },
      exit: shiftEnd
    },

    [NodeType.Key]: shiftLocation,
    [NodeType.String]: shiftLocation,
    [NodeType.Integer]: shiftLocation,
    [NodeType.Float]: shiftLocation,
    [NodeType.Boolean]: shiftLocation,
    [NodeType.DateTime]: shiftLocation,
    [NodeType.Comment]: shiftLocation
  });

  enter_offsets.delete(root);
  exit_offsets.delete(root);
}

export function shiftNode(
  node: TreeNode,
  span: Span,
  options: { first_line_only?: boolean } = {}
): TreeNode {
  const { first_line_only = false } = options;
  const start_line = node.loc.start.line;
  const { lines, columns } = span;
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

function perLine(array: InlineArray): boolean {
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
