import parseTOML from './parse-toml';
import toJS from './to-js';
import diffLite, { formatPath } from './diff-lite';
import { encodeValue } from './encode-lite';
import findByPath from './find-by-path';
import { hasLeadingBom, UTF8_BOM } from './decode-utf8';
import { attachSources } from './cst-source';
import {
  NodeType,
  Document,
  Block,
  TreeNode,
  Value,
  isKeyValue,
  isInlineItem,
  isValue
} from './cst';

type Path = Array<string | number>;

function buildDocument(items: Block[]): Document {
  let endLine = 1;
  let endColumn = 0;

  for (const item of items) {
    const end = item.loc.end;
    if (end.line > endLine || (end.line === endLine && end.column > endColumn)) {
      endLine = end.line;
      endColumn = end.column;
    }
  }

  return {
    type: NodeType.Document,
    loc: { start: { line: 1, column: 0 }, end: { line: endLine, column: endColumn } },
    items
  };
}

function unwrapValue(node: TreeNode): TreeNode {
  if (isKeyValue(node)) return node.value;
  if (isInlineItem(node)) {
    if (isKeyValue(node.item)) return node.item.value;
    return node.item;
  }
  return node;
}

function valueAt(root: any, path: Path): any {
  let value = root;
  for (const segment of path) value = value?.[segment];
  return value;
}

/**
 * Applies in-place value edits to an existing TOML document.
 *
 * This is an edit-only distribution: every change must be an edit to an
 * existing scalar value. Added or removed keys, array length changes, array
 * reordering, key renames and scalar/container type changes all throw before
 * the source is mutated. All text outside the edited value spans is preserved
 * byte for byte.
 *
 * @param existing - The original TOML document as a string
 * @param updated - The updated JavaScript object with desired value changes
 * @returns A new TOML string with only the edited values replaced
 */
export default function patchLite(existing: string, updated: any): string {
  const hadBom = hasLeadingBom(existing);
  const source = hadBom ? existing.slice(1) : existing;

  const items = Array.from(parseTOML(source));
  attachSources(items, source);
  const existingJs = toJS(items, source, { integersAsBigInt: 'asNeeded', temporal: false });

  const changes = diffLite(existingJs, updated);
  if (changes.length === 0) return existing;

  const document = buildDocument(items);

  const replacements: Array<{ start: number; end: number; text: string }> = [];

  for (const change of changes) {
    const node = findByPath(document, change.path);
    const value = unwrapValue(node);

    if (!isValue(value)) {
      throw new Error(`Cannot locate a value at ${formatPath(change.path)}`);
    }

    const range = (value as Value).range;
    if (!range) {
      throw new Error(`Missing source location for value at ${formatPath(change.path)}`);
    }

    replacements.push({
      start: range[0],
      end: range[1],
      text: encodeValue(valueAt(updated, change.path), value, change.path)
    });
  }

  // Apply from the end of the source toward the beginning so earlier offsets
  // stay valid as later spans are replaced.
  replacements.sort((a, b) => b.start - a.start);

  let output = source;
  for (const replacement of replacements) {
    output = output.slice(0, replacement.start) + replacement.text + output.slice(replacement.end);
  }

  return hadBom ? UTF8_BOM + output : output;
}
