import {
  InlineArray,
  InlineTable,
  InlineItem,
  TreeNode,
  isInlineArray,
  isInlineTable,
  isInlineItem
} from './cst';
import { clonePosition } from './location';
import { shiftNode } from './writer';

function hasOneItemPerLine(container: InlineArray | InlineTable): boolean {
  return container.items.length > 0
    && container.loc.end.line - container.loc.start.line + 1 > container.items.length;
}

function isInlineContainer(node: TreeNode): node is InlineArray | InlineTable {
  return isInlineArray(node) || isInlineTable(node);
}

export function prepareInsertedNestedInlineContainer(
  parent: InlineArray | InlineTable,
  child: TreeNode,
  indentWidth: number
): void {
  if (!isInlineItem(child) || !isInlineContainer(child.item) || !hasOneItemPerLine(parent)) return;

  const template = (parent.items as InlineItem[]).find(item =>
    isInlineContainer(item.item)
      && item.item.type === child.item.type
      && hasOneItemPerLine(item.item)
  );
  if (!template || !isInlineContainer(template.item)) return;

  const childContainer = child.item;
  const templateContainer = template.item;
  const rowIndent = templateContainer.items.length > 0
    ? templateContainer.items[0].loc.start.column - templateContainer.loc.start.column
    : indentWidth;
  const firstRow = templateContainer.items.length > 0
    ? templateContainer.items[0].loc.start.line - templateContainer.loc.start.line
    : 1;
  const closingRows = templateContainer.items.length > 0
    ? templateContainer.loc.end.line - templateContainer.items[templateContainer.items.length - 1].loc.end.line
    : 1;
  const startLine = childContainer.loc.start.line;
  const startColumn = childContainer.loc.start.column;

  let nextLine = startLine + firstRow;
  for (const item of childContainer.items) {
    shiftNode(item, {
      lines: nextLine - item.loc.start.line,
      columns: startColumn + rowIndent - item.loc.start.column
    });
    nextLine = item.loc.end.line + 1;
  }

  childContainer.loc.end = {
    line: nextLine - 1 + closingRows,
    column: templateContainer.loc.end.column
  };
  child.loc = { start: clonePosition(childContainer.loc.start), end: clonePosition(childContainer.loc.end) };
}