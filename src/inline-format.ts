import {
  InlineArray,
  InlineTable,
  TreeNode,
  hasItems,
  isInlineArray,
  isInlineItem,
  isInlineTable,
  isKeyValue
} from './cst';
import type { TomlFormat } from './toml-format';

export type InlineContainerKind = 'array' | 'table';

const multilineDecisions = new WeakMap<InlineArray | InlineTable, boolean>();
const positionedContainers = new WeakSet<InlineArray | InlineTable>();

export function resolveInlineContainerLayout(
  kind: InlineContainerKind,
  depth: number,
  parentIsMultiline: boolean,
  format: TomlFormat
): boolean {
  const mode = kind === 'array' ? format.multilineArray : format.multilineTable;
  if (typeof mode === 'boolean') return mode;
  if (typeof mode === 'number') return depth >= mode;
  if (mode === 'parent') return parentIsMultiline;
  return false;
}

export function setInlineContainerLayout(
  container: InlineArray | InlineTable,
  multiline: boolean
): void {
  multilineDecisions.set(container, multiline);
  if (multiline && container.items.length === 0) {
    container.loc.end.line = container.loc.start.line + 1;
    container.loc.end.column = container.loc.start.column + 1;
  }
}

export function getInlineContainerLayout(
  container: InlineArray | InlineTable
): boolean | undefined {
  return multilineDecisions.get(container);
}

export function markInlineContainerPositioned(container: InlineArray | InlineTable): void {
  positionedContainers.add(container);
}

export function isInlineContainerPositioned(container: InlineArray | InlineTable): boolean {
  return positionedContainers.has(container);
}

export function hasStructuralMultilineRows(container: InlineArray | InlineTable): boolean {
  if (!container.items.length) return container.loc.end.line > container.loc.start.line;
  return container.items.some((item, index) => {
    const previous = container.items[index - 1];
    return item.loc.start.line > (previous?.loc.end.line ?? container.loc.start.line);
  });
}

export function findInlineContainerDepth(root: TreeNode, target: InlineArray | InlineTable): number | undefined {
  const visit = (node: TreeNode, depth: number): number | undefined => {
    if (node === target) return depth;
    if (isKeyValue(node)) return visit(node.value, depth);
    if (isInlineItem(node)) return visit(node.item, depth);
    if (isInlineArray(node) || isInlineTable(node)) {
      for (const item of node.items) {
        const result = visit(item, depth + 1);
        if (result !== undefined) return result;
      }
      return undefined;
    }
    if (hasItems(node)) {
      for (const item of node.items) {
        const result = visit(item, depth);
        if (result !== undefined) return result;
      }
    }
    return undefined;
  };

  return visit(root, 0);
}

export function findInlineContainerParent(
  root: TreeNode,
  target: TreeNode
): InlineArray | InlineTable | undefined {
  const visit = (
    node: TreeNode,
    parent: InlineArray | InlineTable | undefined
  ): InlineArray | InlineTable | undefined => {
    if (node === target) return parent;
    if (isKeyValue(node)) return visit(node.value, parent);
    if (isInlineItem(node)) return visit(node.item, parent);
    if (isInlineArray(node) || isInlineTable(node)) {
      for (const item of node.items) {
        const result = visit(item, node);
        if (result) return result;
      }
      return undefined;
    }
    if (hasItems(node)) {
      for (const item of node.items) {
        const result = visit(item, parent);
        if (result) return result;
      }
    }
    return undefined;
  };

  return visit(root, undefined);
}