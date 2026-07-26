import {
  Document,
  Table,
  TableArray,
  TreeNode,
  Comment,
  isComment,
  isKeyValue,
  isTable,
  isTableArray,
  isDocument
} from './cst';
import { last } from './utils';
import { remove, recalcContainerEnd, Root } from './writer';

// See docs/PLAN-Comment-Ownership.md for the full model (rules R1-R6).

// R6 — commented-out entries are not owned.
// Segment charset matches IS_BARE_KEY (/^[\w-]+$/, src/tokenizer.ts:22).
const KEY_SEGMENT = String.raw`(?:[\w-]+|"[^"]*"|'[^']*')`;

/** `# key = ...`, `# a.b.c = ...`, `# "quoted key" = ...` */
export const IS_COMMENTED_OUT_KEY_VALUE =
  new RegExp(String.raw`^#\s*${KEY_SEGMENT}(?:\s*\.\s*${KEY_SEGMENT})*\s*=`);

/** `# [table]`, `# [[array]]`, `# [a.b]` */
export const IS_COMMENTED_OUT_HEADER =
  new RegExp(String.raw`^#\s*\[\[?\s*${KEY_SEGMENT}(?:\s*\.\s*${KEY_SEGMENT})*\s*\]\]?\s*$`);

export function isCommentedOutEntry(comment: Comment): boolean {
  return IS_COMMENTED_OUT_KEY_VALUE.test(comment.raw) || IS_COMMENTED_OUT_HEADER.test(comment.raw);
}

export interface Slot {
  kind: 'member' | 'pinned';
  /** The orderable child: KeyValue | Table | TableArray. Absent for pinned runs. */
  member?: TreeNode;
  /** First key segment — `key.value[0]` / `key.item.value[0]`. Absent for pinned runs. */
  key?: string;
  /** Every node in the slot, in items-array order. */
  items: TreeNode[];
  /** min over items. */
  startLine: number;
  /** max over items — NOT the last item's end, because of hoisted comments. */
  endLine: number;
}

function getMemberKey(member: TreeNode): string | undefined {
  if (isKeyValue(member)) return member.key.value[0];
  if (isTable(member) || isTableArray(member)) return member.key.item.value[0];
  return undefined;
}

/**
 * Partitions a container's items into ownership slots, in document order.
 * Pure: does not mutate the tree.
 *
 * @param isEligibleForLeading - optional predicate; members that fail it cannot
 *   acquire leading comments via R2. Used by callers that have just inserted
 *   nodes which must not adopt a preceding run.
 */
export function resolveSlots(
  container: Document | Table | TableArray,
  isEligibleForLeading: (member: TreeNode) => boolean = () => true
): Slot[] {
  const items = container.items as TreeNode[];
  const slots: Slot[] = [];

  // For a table body, comments on the header's own line (`[a] # hdr`) are
  // owned by the header itself (R1) — initialising to the header's end line
  // makes that fall out of the same check as ownership by a preceding row.
  let lastMemberEndLine = isDocument(container) ? 0 : container.key.loc.end.line;
  let currentMemberSlot: Slot | undefined;
  let pendingRun: Comment[] = [];

  const flushPendingAsPinned = () => {
    if (!pendingRun.length) return;
    slots.push({
      kind: 'pinned',
      items: pendingRun,
      startLine: pendingRun[0].loc.start.line,
      endLine: last(pendingRun)!.loc.end.line
    });
    pendingRun = [];
  };

  for (const item of items) {
    if (isComment(item)) {
      if (item.loc.start.line <= lastMemberEndLine) {
        // R1: right-side ownership wins.
        if (currentMemberSlot) {
          currentMemberSlot.items.push(item);
          currentMemberSlot.endLine = Math.max(currentMemberSlot.endLine, item.loc.end.line);
        } else {
          // Owned by the container's own header (e.g. `[a] # hdr`), which
          // isn't itself a member of `items` — nothing to attach to, and it
          // never travels with any row.
          slots.push({ kind: 'pinned', items: [item], startLine: item.loc.start.line, endLine: item.loc.end.line });
        }
        continue;
      }

      const runEndLine = pendingRun.length ? last(pendingRun)!.loc.end.line : undefined;
      if (pendingRun.length && item.loc.start.line === runEndLine! + 1) {
        pendingRun.push(item);
      } else {
        flushPendingAsPinned();
        pendingRun.push(item);
      }
      continue;
    }

    // A member: KeyValue | Table | TableArray.
    let leading: Comment[] = [];
    if (pendingRun.length) {
      const runEndLine = last(pendingRun)!.loc.end.line;
      const adjacent = runEndLine + 1 === item.loc.start.line;
      const allDead = pendingRun.every(isCommentedOutEntry);
      if (adjacent && isEligibleForLeading(item) && !allDead) {
        // R2, subject to R6.
        leading = pendingRun;
        pendingRun = [];
      } else {
        // R3 (severed by a blank line) or R6 (dead-entry run) — pin it.
        flushPendingAsPinned();
      }
    }

    const slotItems: TreeNode[] = [...leading, item];
    const slot: Slot = {
      kind: 'member',
      member: item,
      key: getMemberKey(item),
      items: slotItems,
      startLine: slotItems[0].loc.start.line,
      endLine: item.loc.end.line
    };
    slots.push(slot);
    currentMemberSlot = slot;
    lastMemberEndLine = item.loc.end.line;
  }

  flushPendingAsPinned(); // R4: a trailing run with no member below it.

  return slots;
}

/**
 * R5, applied once as a general-purpose (non-destructive-to-text) pass: a
 * comment that visually introduces the next [table]/[[array]] block is
 * physically stored as a trailing item of the PREVIOUS block, because the
 * parser consumes everything up to the next `[` into the current table
 * (src/parse-toml.ts:517-524). This re-parents such runs into Document.items,
 * immediately before the block they visually belong to.
 *
 * Mutates the tree; loc-preserving, so serialized output is unchanged. NOTE:
 * because the re-parenting is loc-preserving, a document normalized this way
 * no longer matches what re-parsing its own serialized text would produce
 * (the parser always re-derives the original, pre-normalization container
 * assignment from the text). Do not call this as a blanket pre-pass before
 * general patching — it is intended for callers that immediately consume the
 * result without round-tripping through text (e.g. a future reorder pass that
 * is about to change those lines anyway). For deletion, `removeMember` below
 * computes the same R5 ownership lazily and only mutates when a comment is
 * genuinely being deleted, which has no such divergence risk.
 */
export function normalizeSectionComments(document: Document): void {
  for (let i = 0; i < document.items.length; i++) {
    const block = document.items[i];
    if (!isTable(block) && !isTableArray(block)) continue;

    const nextBlock = document.items[i + 1];
    if (!nextBlock) continue;

    const runItems = trailingOwnedRun(block, nextBlock);
    if (!runItems) continue;

    const items = block.items as TreeNode[];
    items.splice(items.length - runItems.length, runItems.length);
    document.items.splice(i + 1, 0, ...runItems);
    recalcContainerEnd(block);

    i += runItems.length; // skip over the just-inserted comments
  }
}

/**
 * R5, computed lazily: if `container`'s trailing comment run is R2-adjacent
 * to `nextBlock` (and not R6-dead), returns it — these are the comments a
 * removal of `nextBlock` must take along, even though they physically live
 * in `container.items`. Returns undefined otherwise.
 */
function trailingOwnedRun(container: Table | TableArray, nextBlock: TreeNode): Comment[] | undefined {
  const lastSlot = last(resolveSlots(container));
  if (!lastSlot || lastSlot.kind !== 'pinned') return undefined;

  const runItems = lastSlot.items as Comment[];
  const adjacent = lastSlot.endLine + 1 === nextBlock.loc.start.line;
  const allDead = runItems.every(isCommentedOutEntry);
  if (!adjacent || allDead) return undefined;

  return runItems;
}

/**
 * Removes `member` from `parent.items` along with every comment it owns
 * (leading run and right-side/trailing comments — see resolveSlots), plus,
 * when `member` is a [table]/[[array]] block, any trailing comment run the
 * parser filed under the PRECEDING sibling table but which R5 assigns to
 * `member` instead. Falls back to a plain removal when `parent` isn't a
 * container the ownership model applies to (e.g. InlineTable/InlineArray).
 */
export function removeMember(root: Root, parent: TreeNode, member: TreeNode): void {
  if (isDocument(parent) && (isTable(member) || isTableArray(member))) {
    const index = (parent.items as TreeNode[]).indexOf(member);
    const previousSibling = index > 0 ? parent.items[index - 1] : undefined;
    if (previousSibling && (isTable(previousSibling) || isTableArray(previousSibling))) {
      const runItems = trailingOwnedRun(previousSibling, member);
      if (runItems) {
        for (const item of runItems) {
          remove(root, previousSibling, item);
        }
      }
    }
  }

  if (isDocument(parent) || isTable(parent) || isTableArray(parent)) {
    const slot = resolveSlots(parent).find(s => s.member === member);
    if (slot) {
      const memberIndex = slot.items.indexOf(member);

      // Leading comments and the member itself: every one of these occupies
      // its own line(s) that the member's own span does not otherwise cover,
      // so each is removed via the generic primitive, which computes real
      // line/column offset accounting.
      for (let i = 0; i <= memberIndex; i++) {
        const item = slot.items[i];
        // A prior remove() call in this loop may already have absorbed a
        // same-line trailing comment via its own single-comment logic —
        // see the trailing-comments loop below for why that's fine.
        if (!(parent.items as TreeNode[]).includes(item)) continue;
        remove(root, parent, item);
      }

      // Trailing (right-side, R1) comments: by definition their start line
      // is <= the member's own end line, so they sit *within* the span the
      // member's removal above already accounted for (a same-line trailing
      // comment, or one hoisted out of a multiline inline value). remove()'s
      // own legacy same-line check may already have absorbed a simple
      // trailing comment as a side effect of removing the member. Anything
      // still present here is spliced out directly, with NO further offset —
      // registering one would double-count a line height already removed.
      for (let i = memberIndex + 1; i < slot.items.length; i++) {
        const item = slot.items[i];
        const idx = (parent.items as TreeNode[]).indexOf(item);
        if (idx < 0) continue;
        (parent.items as TreeNode[]).splice(idx, 1);
      }
      return;
    }
  }

  remove(root, parent, member);
}
