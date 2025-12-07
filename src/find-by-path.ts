import { TreeNode, isKeyValue, isTable, isTableArray, hasItems, isInlineItem, hasItem } from './ast';
import { arraysEqual, stableStringify } from './utils';

export type Path = Array<string | number>;

export default function findByPath(node: TreeNode, path: Path): TreeNode {
  if (!path.length) {
    // If this is an InlineItem containing a KeyValue, return the KeyValue
    if (isInlineItem(node) && isKeyValue(node.item)) {
      return node.item;
    }
    return node;
  }

  if (isKeyValue(node)) {
    return findByPath(node.value, path);
  }

  const indexes: { [key: string]: number } = {};
  let found;
  if (hasItems(node)) {
    node.items.some((item, index) => {
      try {
        let key: Path = [];
        if (isKeyValue(item)) {
          key = item.key.value;
        } else if (isTable(item)) {
          key = item.key.item.value;
        } else if (isTableArray(item)) {
          key = item.key.item.value;

          const key_string = stableStringify(key);
          if (!indexes[key_string]) {
            indexes[key_string] = 0;
          }
          const array_index = indexes[key_string]++;

          key = key.concat(array_index);
        } else if (isInlineItem(item) && isKeyValue(item.item)) {
          key = item.item.key.value;
        } else if (isInlineItem(item)) {
          key = [index];
        }

        if (key.length && arraysEqual(key, path.slice(0, key.length))) {
          found = findByPath(item, path.slice(key.length));
          return true;
        } else {
          return false;
        }
      } catch (err) {
        return false;
      }
    });
  }

  if (!found) {
    throw new Error(`Could not find node at path ${path.join('.')}`);
  }

  return found;
}

export function tryFindByPath(node: TreeNode, path: Path): TreeNode | undefined {
  try {
    return findByPath(node, path);
  } catch (err) {}
}

export function findParent(node: TreeNode, path: Path): TreeNode {
  let parent_path = path;
  let parent;
  while (parent_path.length && !parent) {
    parent_path = parent_path.slice(0, -1);
    parent = tryFindByPath(node, parent_path);
  }

  if (!parent) {
    throw new Error(`Count not find parent node for path ${path.join('.')}`);
  }

  return parent;
}
