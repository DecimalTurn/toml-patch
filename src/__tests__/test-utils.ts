/**
 * Test-only utilities — not part of the production bundle.
 */

import {
  Document,
  NodeType,
  AST,
  TreeNode,
  InlineArray,
  InlineTable,
  InlineItem,
  KeyValue,
  Table,
  TableArray,
  DateTime,
  Integer,
  String,
} from '../ast';
import { Location } from '../location';
import traverse from '../traverse';

/**
 * Wraps a parsed AST (iterable of items) into a Document node.
 * Useful in tests that need a Document without going through patch().
 */
export function toDocument(ast: AST): Document {
  const items = [...ast];
  return {
    type: NodeType.Document,
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    items,
  };
}

/**
 * Validates that every inline array/table in the document has consistent
 * location metadata (container end-column > last item end-column).
 * Throws if an inconsistency is found.
 */
export function validate(document: Document) {
  traverse(document, {
    [NodeType.InlineArray](node: InlineArray) {
      const { start, end } = node.loc;
      const lastItem = node.items[node.items.length - 1];
      if (lastItem.loc.end.column >= end.column) {
        const stringRepresentation =
          node.items
            .map((item) => (item.item as String | Integer | DateTime).raw)
            .join(', ') +
          '\n' +
          'Elements (<start,end>):' +
          node.items.map(
            (item) =>
              '<' + item.item.loc.start.column + '-' + item.item.loc.end.column + '>'
          ) +
          '\n' +
          'Inline array loc: <' + start.column + '-' + end.column + '>' +
          '\n' +
          'Expected end column: ' + (lastItem.loc.end.column + 1) +
          '\n' +
          'Difference: ' + (lastItem.loc.end.column - end.column) +
          '\n';

        throw new Error(`Invalid inline array: ${stringRepresentation}`);
      }
    },
    [NodeType.InlineTable](node: InlineTable) {
      const { start, end } = node.loc;
      const lastItem = node.items[node.items.length - 1];
      if (lastItem.loc.end.column >= end.column) {
        const stringRepresentation =
          '[' +
          node.items.map((item) => item.item.key + '=' + item.item.value).join(', ') +
          ']';
        throw new Error(`Invalid inline table: ${stringRepresentation}`);
      }
    },
  });
}

/** Returns true if position a is before or equal to position b */
function posLe(a: { line: number; column: number }, b: { line: number; column: number }): boolean {
  return a.line < b.line || (a.line === b.line && a.column <= b.column);
}

function locStr(loc: Location): string {
  return `${loc.start.line}:${loc.start.column}-${loc.end.line}:${loc.end.column}`;
}

/**
 * A more thorough AST validator that checks parent-child location containment.
 * For every parent node that has children, asserts that each child's location
 * fits within the parent's location bounds.
 *
 * Collects all violations and returns them as an array of strings.
 * Returns empty array if the AST is consistent.
 */
export function findPositionOverlaps(document: Document): string[] {
  const violations: string[] = [];

  function checkContainment(parent: TreeNode, child: TreeNode) {
    const p = parent.loc;
    const c = child.loc;

    if (!posLe(p.start, c.start)) {
      violations.push(
        `${child.type} starts at ${locStr(c)} before parent ${parent.type} at ${locStr(p)}`
      );
    }
    if (!posLe(c.end, p.end)) {
      violations.push(
        `${child.type} ends at ${locStr(c)} after parent ${parent.type} at ${locStr(p)}`
      );
    }
  }

  traverse(document, {
    [NodeType.InlineArray]: {
      enter(node: InlineArray, parent: TreeNode | null) {
        if (parent) checkContainment(parent, node);
        for (const item of node.items) {
          checkContainment(node, item);
        }
      }
    },
    [NodeType.InlineTable]: {
      enter(node: InlineTable, parent: TreeNode | null) {
        if (parent) checkContainment(parent, node);
        for (const item of node.items) {
          checkContainment(node, item);
        }
      }
    },
    [NodeType.InlineItem]: {
      enter(node: InlineItem, parent: TreeNode | null) {
        if (parent) checkContainment(parent, node);
        checkContainment(node, node.item);
      }
    },
    [NodeType.KeyValue]: {
      enter(node: KeyValue, parent: TreeNode | null) {
        if (parent) checkContainment(parent, node);
        checkContainment(node, node.key);
        checkContainment(node, node.value);
      }
    },
  });

  return violations;
}
