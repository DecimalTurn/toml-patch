import {
  TreeNode,
  hasItems,
  isInlineItem,
  isKeyValue,
  isTable,
  isTableArray
} from './cst';
import { Position } from './location';

const nodeSources = new WeakMap<TreeNode, string>();
const nodeParents = new WeakMap<TreeNode, TreeNode>();
const linkedRoots = new WeakSet<TreeNode>();
const originalChildren = new WeakMap<TreeNode, TreeNode[]>();

function positionToOffset(lineStarts: number[], position: Position): number {
  return (lineStarts[position.line - 1] ?? lineStarts[lineStarts.length - 1]) + position.column;
}

export function attachSource(node: TreeNode, source: string): void {
  createSourceAttacher(source)(node);
}

export function createSourceAttacher(source: string): (node: TreeNode) => void {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 0x0a) lineStarts.push(index + 1);
  }

  const attach = (current: TreeNode): void => {
  const range = [
      positionToOffset(lineStarts, current.loc.start),
      positionToOffset(lineStarts, current.loc.end)
  ] as const;

    Object.defineProperty(current, 'range', {
    configurable: true,
    enumerable: false,
    value: range
  });
    nodeSources.set(current, source);
    originalChildren.set(current, childrenOf(current));

    if (isKeyValue(current)) {
      attach(current.key);
      attach(current.value);
    } else if (isInlineItem(current)) {
      attach(current.item);
    } else if (isTable(current) || isTableArray(current)) {
      attach(current.key);
      for (const item of current.items as TreeNode[]) attach(item);
    } else if (hasItems(current)) {
      for (const item of current.items as TreeNode[]) attach(item);
    }
  };

  return attach;
}

export function getNodeSource(node: TreeNode): string | undefined {
  return nodeSources.get(node);
}

export function sourceStructureUnchanged(node: TreeNode): boolean {
  const original = originalChildren.get(node);
  if (!original) return false;
  const current = childrenOf(node);
  return original.length === current.length &&
    original.every((child, index) => child === current[index]);
}

function childrenOf(node: TreeNode): TreeNode[] {
  if (isKeyValue(node)) return [node.key, node.value];
  if (isInlineItem(node)) return [node.item];
  if (isTable(node) || isTableArray(node)) {
    return [node.key, ...(node.items as TreeNode[])];
  }
  return hasItems(node) ? node.items as TreeNode[] : [];
}

export function linkParents(root: TreeNode): void {
  if (linkedRoots.has(root)) return;

  const visit = (parent: TreeNode): void => {
    for (const child of childrenOf(parent)) {
      nodeParents.set(child, parent);
      visit(child);
    }
  };
  visit(root);
  linkedRoots.add(root);
}

function markSubtreeDirty(node: TreeNode): void {
  setDirty(node);
  for (const child of childrenOf(node)) markSubtreeDirty(child);
}

export function markTreeDirty(node: TreeNode): void {
  markSubtreeDirty(node);
}

function setDirty(node: TreeNode): void {
  Object.defineProperty(node, 'dirty', {
    configurable: true,
    enumerable: false,
    value: true,
    writable: true
  });
}

export function markMutation(root: TreeNode, parent: TreeNode, changed?: TreeNode): void {
  linkParents(root);
  if (changed) {
    nodeParents.set(changed, parent);
    markSubtreeDirty(changed);
  }

  let current: TreeNode | undefined = parent;
  while (current) {
    setDirty(current);
    current = nodeParents.get(current);
  }
}

export function originalFirstChildStartedAfterOpener(node: TreeNode): boolean {
  const original = originalChildren.get(node);
  return !!original?.[0] && original[0].loc.start.line > node.loc.start.line;
}