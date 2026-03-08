import { Document, NodeType, TreeNode, InlineArray, InlineTable, InlineItem, KeyValue } from '../ast';
import { Location, Position } from '../location';
import parseTOML from '../parse-toml';
import { patchAst } from '../patch';
import { TomlFormat } from '../toml-format';
import traverse from '../traverse';

// ---------------------------------------------------------------------------
// Position-overlap helpers
// ---------------------------------------------------------------------------

/** True when position a <= position b (line-major, column-minor). */
function posLe(a: Position, b: Position): boolean {
  return a.line < b.line || (a.line === b.line && a.column <= b.column);
}

/** Format a location as "line:col-line:col". */
function locStr(loc: Location): string {
  return `${loc.start.line}:${loc.start.column}-${loc.end.line}:${loc.end.column}`;
}

/** Return an error string if child's location exceeds parent's, else null. */
function checkContainment(
  parent: TreeNode,
  child: TreeNode
): string | null {
  const pLoc = parent.loc;
  const cLoc = child.loc;
  if (!pLoc || !cLoc) return null;

  const startOk = posLe(pLoc.start, cLoc.start);
  const endOk = posLe(cLoc.end, pLoc.end);
  if (!startOk || !endOk) {
    return `${child.type} ends at ${locStr(cLoc)} after parent ${parent.type} at ${locStr(pLoc)}`;
  }
  return null;
}

/**
 * Walk the AST and return an array of human-readable overlap descriptions.
 * An empty array means all child positions fit within their parents.
 */
function findPositionOverlaps(doc: Document): string[] {
  const overlaps: string[] = [];

  traverse(doc, {
    InlineArray(node: InlineArray) {
      for (const item of node.items) {
        const msg = checkContainment(node, item as unknown as TreeNode);
        if (msg) overlaps.push(msg);
      }
    },
    InlineTable(node: InlineTable) {
      for (const item of node.items) {
        const msg = checkContainment(node, item as unknown as TreeNode);
        if (msg) overlaps.push(msg);
      }
    },
    InlineItem(node: InlineItem) {
      if (node.item) {
        const msg = checkContainment(node, node.item as unknown as TreeNode);
        if (msg) overlaps.push(msg);
      }
    },
    KeyValue(node: KeyValue) {
      const msg = checkContainment(doc, node);
      if (msg) overlaps.push(msg);
    },
  });

  return overlaps;
}

// ---------------------------------------------------------------------------

/**
 * These tests check whether the AST returned by patchAst() has consistent
 * position metadata after modifications (no parent-child location overlaps).
 *
 * The TOML string output is always correct — toTOML serializes from the AST
 * structure, not from raw positions. However, the AST position metadata may
 * become inconsistent when the writer adjusts nodes without fully propagating
 * position changes to parent containers.
 *
 * findPositionOverlaps() checks that every child node's location fits
 * within its parent's location bounds.
 */

function getOverlaps(toml: string, updated: any): string[] {
  const { document } = patchAst(parseTOML(toml), updated, new TomlFormat());
  return findPositionOverlaps(document);
}

describe('AST position consistency after patching', () => {

  // The writer correctly adjusts inline array/table boundaries after mutations.
  // These cases all produce consistent positions.
  test('add to inline array — inline positions are consistent', () => {
    const overlaps = getOverlaps('ports = [8001, 8002]\n', { ports: [8001, 8002, 8003] });
    // Filter to only inline-level overlaps (exclude Document parent issues)
    const inlineOverlaps = overlaps.filter(v => !v.includes('parent Document'));
    expect(inlineOverlaps).toEqual([]);
  });

  test('add to inline table — inline positions are consistent', () => {
    const overlaps = getOverlaps('point = { x = 1, y = 2 }\n', { point: { x: 1, y: 2, z: 3 } });
    const inlineOverlaps = overlaps.filter(v => !v.includes('parent Document'));
    expect(inlineOverlaps).toEqual([]);
  });

  // However, when items are added/expanded, the Document's end position does
  // NOT get updated to encompass the new content. The writer shifts child
  // positions correctly but doesn't propagate the size change up to the
  // Document container.
  //
  // This is a known limitation — the Document position is a synthetic value
  // created during patching and is not used by toTOML. Skipped for now.
  //
  // Verified failing on 2026-03-07:
  //   "KeyValue ends at 1:0-1:19 after parent Document at 1:0-1:12"
  test('Document end position should encompass all children after add', () => {
    // Adding items to `x = [1]` expands the KV to column 19,
    // but the Document's end stays at column 12.
    const overlaps = getOverlaps('x = [1]\n', { x: [1, 2, 3, 4, 5] });
    expect(overlaps).toEqual([]);
  });

  // Verified failing on 2026-03-07:
  //   "KeyValue ends at 1:0-1:18 after parent Document at 1:0-1:5"
  test('Document end position should encompass all children after edit', () => {
    // Replacing `x = 1` with `x = 100000` grows the KV, but Document
    // end position doesn't track the expansion.
    const overlaps = getOverlaps('p = { x = 1 }\n', { p: { x: 100000 } });
    expect(overlaps).toEqual([]);
  });
});
