import { InlineArray, InlineTable } from './cst';

// Parse-time comma spacing per inline container: the horizontal gap a
// separating comma occupies between two adjacent elements (1 = compact
// `[1,2]`, 2 = spaced `[1, 2]`).  The parser records it here because the
// writer needs this ORIGINAL spacing long after the items' own positions have
// been shifted by pending edits (whose offsets are only resolved in
// applyWrites).  Kept out of the CST node shape so snapshots/structural
// equality of parsed documents are unaffected.
const commaSpace = new WeakMap<InlineArray | InlineTable, number>();

export function setCommaSpace(node: InlineArray | InlineTable, gap: number): void {
  commaSpace.set(node, gap);
}

export function getCommaSpace(node: InlineArray | InlineTable): number | undefined {
  return commaSpace.get(node);
}
