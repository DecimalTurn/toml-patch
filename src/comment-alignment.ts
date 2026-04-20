/**
 * @file Comment alignment helpers for the patch pipeline.
 * @module comment-alignment
 *
 * Utilities for preserving and normalizing aligned inline comments during patching.
 *
 * This module owns the comment-column logic used by the patch pipeline:
 * it detects whether an inline comment belongs to an aligned group, preserves
 * that alignment when edits change value width, compensates for inline insert
 * width deltas, and performs a final string-level normalization pass for padded
 * aligned comment blocks.
 */
import {
  Comment,
  Document,
  KeyValue,
  Table,
  TableArray,
  TreeNode,
  Value,
  hasItems,
  isComment,
  isInlineArray,
  isInlineItem,
  isInlineTable,
  isTable,
  isTableArray
} from './ast';
import { getSpan } from './location';
import { TomlFormat } from './toml-format';

/**
 * Returns the inline comment attached to the item at the given index.
 *
 * An attached inline comment is the first comment that starts on the same line
 * as the item's end position, before any later non-comment row begins.
 *
 * @param items Container items to inspect.
 * @param index Index of the row whose trailing comment should be resolved.
 * @returns The attached inline comment, if present.
 */
function getAttachedInlineComment(items: TreeNode[], index: number): Comment | undefined {
  const current = items[index];
  const commentLine = current.loc.end.line;

  for (let i = index + 1; i < items.length; i++) {
    const candidate = items[i];
    if (isComment(candidate) && candidate.loc.start.line === commentLine) {
      return candidate;
    }

    if (!isComment(candidate) && candidate.loc.start.line > commentLine) {
      return;
    }
  }
}

/**
 * Finds the nearest non-comment row index in the requested direction.
 *
 * @param items Container items to scan.
 * @param index Starting row index.
 * @param direction Scan direction: `-1` for upward, `1` for downward.
 * @returns The nearest neighboring row index, if one exists.
 */
function getNeighborRowIndex(items: TreeNode[], index: number, direction: -1 | 1): number | undefined {
  for (let i = index + direction; i >= 0 && i < items.length; i += direction) {
    if (!isComment(items[i])) {
      return i;
    }
  }
}

/**
 * Repositions an inline comment to keep it aligned after a width change.
 *
 * @param comment Comment node to adjust.
 * @param targetColumn Desired aligned column for the comment start.
 * @param deltaColumns Horizontal width delta introduced by the edit.
 */
function applyInlineCommentColumnAdjustment(comment: Comment, targetColumn: number, deltaColumns: number) {
  const adjustment = targetColumn - (comment.loc.start.column + deltaColumns);

  if (adjustment !== 0) {
    comment.loc.start.column += adjustment;
    comment.loc.end.column += adjustment;
  }
}

/**
 * Preserves an aligned trailing inline comment when the row's value node is
 * being replaced by another value node.
 *
 * Use this in edit flows where the patch operation has both the old value and
 * the new value available, for example when `a = "x" # note` becomes
 * `a = "much longer text" # note`. The function computes the width delta from
 * `existingValue` and `replacementValue`, then repositions the same-line
 * comment so it stays aligned with the adjacent rows that were already aligned
 * before the edit.
 *
 * In short:
 * - `preserveAlignedInlineCommentColumn` is for replacement edits
 * - it derives `deltaColumns` itself from the old and new value spans
 *
 * The comment is adjusted only when the current row already belongs to a
 * vertically aligned comment group with an immediately adjacent row above or
 * below, and both old and new values are single-line.
 *
 * @param container Parent container that owns the row.
 * @param row Key-value row being edited.
 * @param existingValue Original value before replacement.
 * @param replacementValue Replacement value after editing.
 */
export function preserveAlignedInlineCommentColumn(
  container: TreeNode,
  row: KeyValue,
  existingValue: TreeNode,
  replacementValue: TreeNode
) {
  if (!hasItems(container)) return;

  const items = container.items as TreeNode[];
  const rowIndex = items.indexOf(row);
  if (rowIndex < 0) return;

  const comment = getAttachedInlineComment(items, rowIndex);
  if (!comment) return;

  if (existingValue.loc.start.line !== existingValue.loc.end.line) return;
  if (replacementValue.loc.start.line !== replacementValue.loc.end.line) return;

  const currentColumn = comment.loc.start.column;
  const currentLine = comment.loc.start.line;
  const neighborIndexes = [
    getNeighborRowIndex(items, rowIndex, -1),
    getNeighborRowIndex(items, rowIndex, 1)
  ];

  let alignedColumn: number | undefined;
  for (const neighborIndex of neighborIndexes) {
    if (neighborIndex == null) continue;

    const neighborComment = getAttachedInlineComment(items, neighborIndex);
    if (!neighborComment) continue;
    if (Math.abs(neighborComment.loc.start.line - currentLine) !== 1) continue;
    if (neighborComment.loc.start.column !== currentColumn) continue;

    alignedColumn = neighborComment.loc.start.column;
    break;
  }

  if (alignedColumn == null) return;

  const existingSpan = getSpan(existingValue.loc);
  const replacementSpan = getSpan(replacementValue.loc);
  const deltaColumns = replacementSpan.columns - existingSpan.columns;

  applyInlineCommentColumnAdjustment(comment, alignedColumn, deltaColumns);
}

/**
 * Preserves an aligned trailing inline comment when the row gets wider because
 * content was inserted inside an inline container, but the row value node
 * itself was not replaced.
 *
 * Use this in add/insert flows where the caller already knows the rendered
 * width change, for example when inserting a new element into an inline array
 * on a row like `a = [1, 2] # note`. In that case there is no old-vs-new row
 * value pair available here, so the caller passes the precomputed
 * `deltaColumns` directly.
 *
 * In short:
 * - `preserveAlignedInlineCommentForDelta` is for insertion-driven width shifts
 * - it consumes a precomputed `deltaColumns` instead of comparing two value nodes
 *
 * @param container Parent container that owns the row.
 * @param row Key-value row whose trailing comment may need to move.
 * @param deltaColumns Horizontal width delta introduced by the insertion.
 */
export function preserveAlignedInlineCommentForDelta(
  container: TreeNode,
  row: KeyValue,
  deltaColumns: number
) {
  if (!hasItems(container)) return;

  const items = container.items as TreeNode[];
  const rowIndex = items.indexOf(row);
  if (rowIndex < 0) return;

  const comment = getAttachedInlineComment(items, rowIndex);
  if (!comment) return;

  const currentColumn = comment.loc.start.column;
  const currentLine = comment.loc.start.line;
  const neighborIndexes = [
    getNeighborRowIndex(items, rowIndex, -1),
    getNeighborRowIndex(items, rowIndex, 1)
  ];

  for (const neighborIndex of neighborIndexes) {
    if (neighborIndex == null) continue;

    const neighborComment = getAttachedInlineComment(items, neighborIndex);
    if (!neighborComment) continue;
    if (Math.abs(neighborComment.loc.start.line - currentLine) !== 1) continue;
    if (neighborComment.loc.start.column !== currentColumn) continue;

    applyInlineCommentColumnAdjustment(comment, neighborComment.loc.start.column, deltaColumns);
    return;
  }
}

/**
 * Estimates the horizontal column delta caused by inserting a new inline item.
 *
 * The result includes the inserted value width and the comma/spacing overhead
 * needed by the surrounding inline array or inline table formatting.
 *
 * @param parent Inline container receiving the new child.
 * @param child AST node being inserted.
 * @param index Target insertion index.
 * @returns The number of columns added to the rendered row.
 */
export function getInlineInsertColumnDelta(parent: Value, child: TreeNode, index: number): number {
  if (!isInlineArray(parent) && !isInlineTable(parent)) return 0;

  const childSpan = getSpan(child.loc);
  const hasSeparatingCommaBefore = index > 0;
  const hasSeparatingCommaAfter = index < parent.items.length;
  const isLastElement = index === parent.items.length;
  const hasTrailingComma = isInlineItem(child) ? child.comma : false;
  const hasTrailingCommaSpacingBug =
    hasSeparatingCommaBefore && hasTrailingComma && !hasSeparatingCommaAfter && isLastElement;

  return (
    childSpan.columns +
    (hasSeparatingCommaBefore || hasSeparatingCommaAfter ? 2 : 0) +
    (hasTrailingComma ? 1 + (hasTrailingCommaSpacingBug ? -1 : 0) : 0)
  );
}

/**
 * Recursively collects comment nodes from the document and nested tables.
 *
 * @param node Document or table-like node to traverse.
 * @param comments Accumulator used during recursion.
 * @returns All discovered comment nodes.
 */
function collectComments(node: Document | Table | TableArray, comments: Comment[] = []): Comment[] {
  for (const item of node.items) {
    if (isComment(item)) {
      comments.push(item);
      continue;
    }

    if (isTable(item) || isTableArray(item)) {
      collectComments(item, comments);
    }
  }

  return comments;
}

/**
 * Normalizes padded inline comment groups in the final rendered TOML string.
 *
 * This pass is intentionally limited to comments that already have explicit
 * padding before `#`, which avoids disturbing compact TOML 1.1 inline-table
 * comment styles while still restoring vertical alignment for normal row-based
 * comment blocks.
 *
 * @param document Patched AST document whose comment locations are updated in-place.
 * @param tomlString Rendered TOML output to normalize.
 * @param format Active TOML formatting settings.
 * @returns The normalized TOML string.
 */
export function normalizeInlineCommentAlignmentInString(
  document: Document,
  tomlString: string,
  format: TomlFormat
): string {
  const newLine = format.newLine;
  const trailingMatch = tomlString.match(/(?:\r\n|\n)+$/u);
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const body = trailing ? tomlString.slice(0, -trailing.length) : tomlString;
  const lines = body.length ? body.split(newLine) : [];

  const comments = collectComments(document)
    .filter(comment => {
      const line = lines[comment.loc.start.line - 1] || '';
      const beforeComment = line.slice(0, comment.loc.start.column);
      return beforeComment.trim().length > 0 && /\s{2,}$/u.test(beforeComment);
    })
    .sort((a, b) => a.loc.start.line - b.loc.start.line);

  const groups: Comment[][] = [];
  let currentGroup: Comment[] = [];
  for (const comment of comments) {
    const previous = currentGroup[currentGroup.length - 1];
    if (!previous || comment.loc.start.line === previous.loc.start.line + 1) {
      currentGroup.push(comment);
    } else {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [comment];
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  for (const group of groups) {
    if (group.length < 2) continue;

    const counts = new Map<number, number>();
    for (const comment of group) {
      counts.set(comment.loc.start.column, (counts.get(comment.loc.start.column) || 0) + 1);
    }

    let targetColumn: number | undefined;
    let highestCount = 1;
    for (const [column, count] of counts) {
      if (count > highestCount) {
        highestCount = count;
        targetColumn = column;
      }
    }

    if (targetColumn == null) continue;

    for (const comment of group) {
      if (comment.loc.start.column === targetColumn) continue;

      const lineIndex = comment.loc.start.line - 1;
      const line = lines[lineIndex] || '';
      const code = line.slice(0, comment.loc.start.column).trimEnd();
      const spaces = ' '.repeat(Math.max(1, targetColumn - code.length));
      lines[lineIndex] = code + spaces + comment.raw;

      const delta = targetColumn - comment.loc.start.column;
      comment.loc.start.column += delta;
      comment.loc.end.column += delta;
    }
  }

  return lines.join(newLine) + trailing;
}