import {
  InlineArray,
  InlineTable,
  InlineItem,
  TreeNode,
  isInlineArray,
  isInlineItem
} from './cst';
import { clonePosition } from './location';
import { shiftNode } from './writer';

function hasOneItemPerLine(container: InlineArray | InlineTable): boolean {
  return container.items.length > 0
    && container.loc.end.line - container.loc.start.line + 1 > container.items.length;
}

export function prepareInsertedNestedArray(
  parent: InlineArray | InlineTable,
  child: TreeNode,
  indentWidth: number
): void {
  if (!isInlineItem(child) || !isInlineArray(child.item) || !hasOneItemPerLine(parent)) return;

  const template = (parent.items as InlineItem[]).find(item =>
    isInlineArray(item.item) && hasOneItemPerLine(item.item)
  );
  if (!template || !isInlineArray(template.item)) return;

  const childArray = child.item;
  const templateArray = template.item;
  const rowIndent = templateArray.items.length > 0
    ? templateArray.items[0].loc.start.column - templateArray.loc.start.column
    : indentWidth;
  const firstRow = templateArray.items.length > 0
    ? templateArray.items[0].loc.start.line - templateArray.loc.start.line
    : 1;
  const closingRows = templateArray.items.length > 0
    ? templateArray.loc.end.line - templateArray.items[templateArray.items.length - 1].loc.end.line
    : 1;
  const startLine = childArray.loc.start.line;
  const startColumn = childArray.loc.start.column;

  let nextLine = startLine + firstRow;
  for (const item of childArray.items) {
    shiftNode(item, {
      lines: nextLine - item.loc.start.line,
      columns: startColumn + rowIndent - item.loc.start.column
    });
    nextLine = item.loc.end.line + 1;
  }

  childArray.loc.end = {
    line: nextLine - 1 + closingRows,
    column: templateArray.loc.end.column
  };
  child.loc = { start: clonePosition(childArray.loc.start), end: clonePosition(childArray.loc.end) };
}