import { TreeNode, isKeyValue, isTable, isTableArray, isDocument, hasItems, isInlineItem, Document, Table, TableArray, Block } from './ast';
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
    node.items.some((item, itemIndex) => {
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
          key = [itemIndex];
        }

        if (key.length && arraysEqual(key, path.slice(0, key.length))) {
          const remainingPath = path.slice(key.length);

          // Special handling for TableArray items within a Document:
          // sub-tables ([fruit.physical]) and sub-AOTs ([[fruit.variety]]) under
          // this entry are siblings in the Document, not children of the entry node.
          // When the remaining path can't be satisfied by the entry's own items,
          // fall back to a scoped search over the document items that logically
          // belong to this AOT entry (everything between this entry and the next
          // entry with the same key).
          if (isDocument(node) && isTableArray(item) && remainingPath.length > 0) {
            const aotKey = (item as TableArray).key.item.value;
            const doc = node as Document;
            const nextSameKeyDocIndex = doc.items.findIndex((sibling, i) =>
              i > itemIndex &&
              isTableArray(sibling) &&
              arraysEqual((sibling as TableArray).key.item.value, aotKey)
            );
            const scopeEnd = nextSameKeyDocIndex === -1 ? doc.items.length : nextSameKeyDocIndex;
            const scopedItems = doc.items.slice(itemIndex + 1, scopeEnd) as Block[];

            found = findByPathInAotScope(item as TableArray, remainingPath, aotKey, scopedItems);
          } else if (isInlineItem(item) && isKeyValue(item.item)) {
            if (path.length === key.length) {
              // If we've matched the full path, return the InlineItem itself
              // so it can be found and replaced in the parent's items array
              found = item;
            } else {
              // Continue searching within the KeyValue's value
              found = findByPath(item.item.value, remainingPath);
            }
          } else if (isInlineItem(item) && path.length > key.length) {
            // For non-KeyValue InlineItems (e.g. an InlineTable inside an array),
            // when there is still path to resolve, recurse into the inner node.
            // Without this, findByPath(InlineItem, ['key']) would fail because
            // InlineItem itself has no .items to traverse.
            found = findByPath(item.item, remainingPath);
          } else {
            found = findByPath(item, remainingPath);
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

/**
 * Searches for a path within an AOT entry's logical scope.
 *
 * In the TOML AST, sub-tables and sub-AOTs under a [[name]] entry are stored
 * as siblings in the Document rather than as children of the entry node.
 * This function first tries the entry's own items, then falls back to the
 * scoped document items (those between this [[name]] and the next [[name]]).
 *
 * @param entry - The TableArray entry node (e.g. the first [[fruit]])
 * @param remainingPath - The path segments still to be resolved (e.g. ['variety', 1, 'name'])
 * @param entryKey - The full key of the entry (e.g. ['fruit'])
 * @param scopedItems - Document items logically belonging to this entry's scope
 */
function findByPathInAotScope(
  entry: TableArray,
  remainingPath: Path,
  entryKey: string[],
  scopedItems: Block[]
): TreeNode {
  // First try the entry's own items (normal path resolution)
  try {
    return findByPath(entry, remainingPath);
  } catch {}

  // Search scoped document items for sub-tables and sub-AOTs whose keys
  // start with the AOT entry key and match the remaining path.
  const indexes: { [key: string]: number } = {};

  for (const item of scopedItems) {
    let key: Path = [];

    if (isTable(item)) {
      const fullKey = (item as Table).key.item.value;
      if (
        fullKey.length > entryKey.length &&
        arraysEqual(fullKey.slice(0, entryKey.length), entryKey)
      ) {
        key = fullKey.slice(entryKey.length);
      }
    } else if (isTableArray(item)) {
      const fullKey = (item as TableArray).key.item.value;
      if (
        fullKey.length > entryKey.length &&
        arraysEqual(fullKey.slice(0, entryKey.length), entryKey)
      ) {
        const relativeKey = fullKey.slice(entryKey.length);
        const key_string = stableStringify(relativeKey);
        if (!indexes[key_string]) indexes[key_string] = 0;
        const array_index = indexes[key_string]++;
        key = (relativeKey as Path).concat(array_index);
      }
    }

    if (key.length && arraysEqual(key, remainingPath.slice(0, key.length))) {
      try {
        return findByPath(item, remainingPath.slice(key.length));
      } catch {}
    }
  }

  throw new Error(`Node not found at (aot scope) ${remainingPath.join('.')}`);
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
