import { attachSource, sourceStructureUnchanged } from '../cst-source';
import { NodeType } from '../cst';
import type { Comment, Document } from '../cst';

describe('sourceStructureUnchanged', () => {
  test('returns false after an in-place splice of the children array', () => {
    const comment = (raw: string): Comment => ({
      type: NodeType.Comment,
      raw,
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: raw.length } }
    });

    const doc: Document = {
      type: NodeType.Document,
      items: [comment('# a'), comment('# b')],
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
    };

    attachSource(doc, '# a\n# b\n');

    expect(sourceStructureUnchanged(doc)).toBe(true);

    doc.items.splice(0, 1);

    // childrenOf() returns Document.items by reference, so originalChildren
    // aliases the same array that just got spliced. sourceStructureUnchanged
    // then compares the array against itself and wrongly reports "unchanged".
    expect(sourceStructureUnchanged(doc)).toBe(false);
  });
});
