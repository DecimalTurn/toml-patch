import parseTOML from '../parse-toml';
import { patchAst } from '../patch';
import { TomlFormat } from '../toml-format';
import { findPositionOverlaps } from './test-utils';

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
