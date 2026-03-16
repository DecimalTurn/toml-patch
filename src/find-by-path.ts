import { TreeNode, isKeyValue, isTable, isTableArray, hasItems, isInlineItem } from './ast';
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
          // For InlineItems wrapping KeyValues, extract the key
          key = item.item.key.value;
        } else if (isInlineItem(item)) {
          key = [index];
        }

        if (key.length && arraysEqual(key, path.slice(0, key.length))) {
          // For InlineItems containing KeyValues, we need to search within the value
          // but still return the InlineItem or its contents appropriately
          if (isInlineItem(item) && isKeyValue(item.item)) {
            if (path.length === key.length) {
              // If we've matched the full path, return the InlineItem itself
              // so it can be found and replaced in the parent's items array
              found = item;
            } else {
              // Continue searching within the KeyValue's value
              found = findByPath(item.item.value, path.slice(key.length));
            }
          } else if (isInlineItem(item) && path.length > key.length) {
            // For non-KeyValue InlineItems (e.g. an InlineTable inside an array),
            // when there is still path to resolve, recurse into the inner node.
            // Without this, findByPath(InlineItem, ['key']) would fail because
            // InlineItem itself has no .items to traverse.
            found = findByPath(item.item, path.slice(key.length));
          } else {
            found = findByPath(item, path.slice(key.length));
          }
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
    throw new Error(`Node not found at ${path.join('.')}`);
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
    throw new Error(`Parent not found for ${path.join('.')}`);
  }

  return parent;
}
