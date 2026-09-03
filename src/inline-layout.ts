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
import { hasStructuralMultilineRows, markGeneratedNestedTable, markGeneratedNestedTableHost, markInlineContainerPositioned } from './inline-format';

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
  markInlineContainerPositioned(childContainer);
  child.loc = { start: clonePosition(childContainer.loc.start), end: clonePosition(childContainer.loc.end) };
}

export function positionGeneratedNestedInlineTables(
  container: InlineArray,
  indentWidth: number
): void {
  const visit = (current: InlineArray): boolean => {
    let changed = false;
    for (const item of current.items) {
      if (!isInlineItem(item) || !isInlineContainer(item.item)) continue;

      const child = item.item;
      if (isInlineTable(child) && hasStructuralMultilineRows(child)) {
        delete (item as { range?: [number, number] }).range;
        delete (child as { range?: [number, number] }).range;
        const rowColumn = child.loc.start.column + Math.max(indentWidth, 2);
        for (const row of child.items) {
          shiftNode(row, { lines: 0, columns: rowColumn - row.loc.start.column });
        }
        child.loc.end.column = child.loc.start.column + 1;
        markGeneratedNestedTable(child);
        markInlineContainerPositioned(child);
        changed = true;
        markGeneratedNestedTableHost(current);

        item.comma = true;
        item.loc.end = {
          line: child.loc.end.line,
          column: child.loc.end.column
        };
        current.loc.end = {
          line: child.loc.end.line,
          column: child.loc.end.column + (item.comma ? 2 : 1)
        };
      }

      if (isInlineArray(child) && visit(child)) {
        delete (child as { range?: [number, number] }).range;
        delete (item as { range?: [number, number] }).range;
        item.loc.end = {
          line: child.loc.end.line,
          column: child.loc.end.column
        };
        changed = true;
        markGeneratedNestedTableHost(current);
      }
    }
    if (changed) {
      for (let index = 1; index < current.items.length; index++) {
        const previous = current.items[index - 1];
        const next = current.items[index];
        if (previous.loc.end.line !== next.loc.start.line) continue;
        const targetColumn = previous.loc.end.column + (previous.comma ? 2 : 1);
        shiftNode(next, { lines: 0, columns: targetColumn - next.loc.start.column });
      }
      const last = current.items[current.items.length - 1];
      if (last) {
        current.loc.end = {
          line: Math.max(current.loc.end.line, last.loc.end.line),
          column: last.loc.end.column + (last.comma ? 2 : 1)
        };
      }
    }
    return changed;
  };

  visit(container);
}