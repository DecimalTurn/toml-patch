import {
  Document,
  Table,
  TableArray,
  InlineTable,
  InlineArray,
  KeyValue,
  TreeNode,
  Comment,
  isComment,
  isKeyValue,
  isTable,
  isTableArray,
  isDocument,
  isInlineTable,
  isInlineArray,
  isInlineItem
} from './cst';
import { last } from './utils';
import { clonePosition } from './location';
import { remove, insert, shiftNode, applyWrites, recalcContainerEnd, Root } from './writer';

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

/**
 * True only for a genuinely multi-line InlineTable/InlineArray. Single-line
 * containers can never hold hoisted interior comments in the first place
 * (Non-goals in the plan doc), and — critically — `start.line === end.line`
 * for a single-line container means ANY same-line trailing comment on the
 * OUTER key-value (e.g. `data = [x, y] # note`) would otherwise appear to
 * fall "inside" a nested single-line array's own line range too, wrongly
 * treating an unrelated comment as hoisted from inside it. The element-level
 * ownership machinery below (resolveInlineElementSlots / removeMember's and
 * moveInlineElement's InlineTable/InlineArray branches) must only engage
 * here, matching writer.ts's own `isMultilineInlineContainer` convention.
 */
function isMultilineInlineContainer(node: TreeNode): node is InlineTable | InlineArray {
  return (isInlineTable(node) || isInlineArray(node)) && node.loc.end.line > node.loc.start.line;
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
  if (isInlineItem(member) && isKeyValue(member.item)) return (member.item as KeyValue).key.value[0];
  return undefined;
}

/**
 * The rule scan shared by resolveSlots (Document/Table/TableArray, where members
 * and comments are already interleaved in one items array) and
 * resolveInlineElementSlots (InlineTable/InlineArray, where they are merged from
 * two different arrays first — see that function). `items` must already be in
 * ascending line order; a `Comment` node is a comment, anything else is a member.
 */
function scanSlots(
  items: TreeNode[],
  initialLastMemberEndLine: number,
  isEligibleForLeading: (member: TreeNode) => boolean
): Slot[] {
  const slots: Slot[] = [];

  let lastMemberEndLine = initialLastMemberEndLine;
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

    // A member: KeyValue | Table | TableArray | InlineItem.
    let leading: Comment[] = [];
    if (pendingRun.length) {
      const runEndLine = last(pendingRun)!.loc.end.line;
      const adjacent = runEndLine + 1 === item.loc.start.line;
      const allDead = pendingRun.every(isCommentedOutEntry);
      if (adjacent && isEligibleForLeading(item) && !allDead) {
        // R2, subject to R6.  When the run contains dead entries
        // (commented-out KVs) but ends with an alive comment (prose),
        // only the suffix after the LAST dead entry belongs to the KV.
        // The dead entries and anything before them are pinned — they
        // look like their own "section" of commented-out content.
        // If the run ends with a dead entry, the whole run belongs
        // to the KV (one prose line defeats R6).
        const lastComment = last(pendingRun)!;
        if (!isCommentedOutEntry(lastComment)) {
          let lastDeadIdx = -1;
          for (let i = pendingRun.length - 2; i >= 0; i--) {
            if (isCommentedOutEntry(pendingRun[i])) {
              lastDeadIdx = i;
              break;
            }
          }
          if (lastDeadIdx >= 0) {
            const pinned = pendingRun.splice(0, lastDeadIdx + 1);
            slots.push({
              kind: 'pinned',
              items: pinned,
              startLine: pinned[0].loc.start.line,
              endLine: last(pinned)!.loc.end.line
            });
          }
        }
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
  // For a table body, comments on the header's own line (`[a] # hdr`) are
  // owned by the header itself (R1) — initialising to the header's end line
  // makes that fall out of the same check as ownership by a preceding row.
  const initialLastMemberEndLine = isDocument(container) ? 0 : container.key.loc.end.line;
  return scanSlots(container.items as TreeNode[], initialLastMemberEndLine, isEligibleForLeading);
}

/**
 * The element-level analogue of resolveSlots, for a multi-line InlineTable or
 * InlineArray. Unlike Document/Table/TableArray, an inline container's own
 * `.items` can never hold a Comment (InlineTableItem/InlineArrayItem are both
 * InlineItem<...>) — the parser hoists interior comments out into the
 * *enclosing* Document/Table's `.items` instead (Background, case 4 in the
 * plan doc). `hostItems` is that enclosing container's `.items`; this merges
 * the comments physically inside `container`'s line range back in with
 * `container.items` (sorted into true reading order) before running the same
 * scan resolveSlots uses.
 *
 * There is no R6 analogue for bare array elements (they aren't `key = value`
 * shaped), but nothing here suppresses R6 for an InlineArray's own comments —
 * see docs/PLAN-Comment-Ownership.md for why that's an accepted, untested edge
 * case rather than a deliberate rule.
 */
export function resolveInlineElementSlots(
  container: InlineTable | InlineArray,
  hostItems: TreeNode[]
): Slot[] {
  const interiorComments = hostItems.filter(
    (item): item is Comment =>
      isComment(item) &&
      item.loc.start.line >= container.loc.start.line &&
      item.loc.start.line <= container.loc.end.line
  );

  const merged: TreeNode[] = [...(container.items as TreeNode[]), ...interiorComments].sort(
    (a, b) => a.loc.start.line - b.loc.start.line || a.loc.start.column - b.loc.start.column
  );

  return scanSlots(merged, container.loc.start.line, () => true);
}

/**
 * Finds the nearest Document/Table/TableArray ancestor whose OWN `.items`
 * holds the top-level Block from which `target` is reachable, following
 * KeyValue.value / InlineTable.items / InlineArray.items / InlineItem.item
 * links down through any nesting depth. This is where the parser files
 * comments hoisted out of `target` (Background, case 4) — regardless of how
 * deeply `target` is nested inside other inline containers, they always
 * flatten up to the same enclosing Document/Table.
 */
export function findHostContainer(root: Document, target: TreeNode): Document | Table | TableArray | undefined {
  function searchValue(value: TreeNode, container: Document | Table | TableArray): Document | Table | TableArray | undefined {
    if (value === target) return container;
    // An inline table's entries are InlineItems wrapping a KeyValue, so reaching anything
    // nested under one of its keys means stepping through that KeyValue's value. Without
    // this, `t = { xs = [...] }` never reaches `xs`'s array and the caller falls back to the
    // comment-oblivious path.
    if (isKeyValue(value)) return searchValue(value.value, container);
    if (isInlineTable(value) || isInlineArray(value)) {
      for (const inlineItem of (value as InlineTable | InlineArray).items) {
        if ((inlineItem as TreeNode) === target) return container;
        const found = searchValue(inlineItem.item, container);
        if (found) return found;
      }
    }
    return undefined;
  }

  function search(container: Document | Table | TableArray): Document | Table | TableArray | undefined {
    for (const item of container.items as TreeNode[]) {
      if (item === target) return container;
      if (isKeyValue(item)) {
        const found = searchValue(item.value, container);
        if (found) return found;
      } else if (isTable(item) || isTableArray(item)) {
        const found = search(item);
        if (found) return found;
      }
    }
    return undefined;
  }

  return search(root);
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

  if (isMultilineInlineContainer(parent) && isDocument(root)) {
    const hostContainer = findHostContainer(root, parent);
    if (hostContainer) {
      const slot = resolveInlineElementSlots(parent, hostContainer.items as TreeNode[]).find(s => s.member === member);
      if (slot) {
        const comments = slot.items.filter(item => item !== member) as Comment[];

        // Every comment in this slot is hoisted into hostContainer (the
        // enclosing Document/Table) — a DIFFERENT array from the member's own
        // `parent.items`, and NOT a sibling of it: hostContainer.items holds
        // the KeyValue that owns `parent` as its value, so an offset
        // registered there only ever affects that KeyValue's OWN siblings
        // (e.g. a later root key), never the surviving rows still inside
        // `parent` (a descendant of that KeyValue, not a sibling). Splicing
        // the comments out directly here (zero offset — purely structural),
        // then extending the member's own loc to cover their lines before
        // removing IT, lets remove()'s existing target-selection (a
        // preceding sibling row within `parent`, or an ENTER offset on
        // `parent` itself when the member is first) correctly propagate ONE
        // combined height reduction to both `parent`'s remaining rows and
        // whatever comes after it — it only needs the full height, comments
        // included, in a single call. `member` is being discarded regardless,
        // so mutating its own loc here has no lasting effect.
        for (const comment of comments) {
          const idx = (hostContainer.items as TreeNode[]).indexOf(comment);
          if (idx < 0) continue;
          (hostContainer.items as TreeNode[]).splice(idx, 1);
        }

        if (comments.length) {
          member.loc.start = slot.items[0].loc.start;
          member.loc.end = last(slot.items)!.loc.end;
        }

        remove(root, parent, member, hostContainer.items as TreeNode[]);

        // Flush immediately, matching moveInlineElement's identical discipline (see
        // its docstring): writer.remove()'s own orphaned-comment compensation above
        // mutates surviving comments' `.loc` as a PRE-compensation for an offset that
        // only actually resolves once applyWrites runs. If a SECOND removeMember (or
        // moveInlineElement) call on this same container ran before that offset were
        // resolved, resolveInlineElementSlots would read those pre-compensated,
        // not-yet-restored positions as if they were final — misattributing or
        // losing ownership. Flushing here keeps every subsequent call in this patch
        // starting from a fully-resolved, non-stale state.
        applyWrites(root);
        return;
      }
    }
  }

  remove(root, parent, member);
}

/**
 * Relocates `node` (an element of `parent`, an InlineTable/InlineArray) from
 * its current position to `toIndex`, carrying its own owned comments along
 * (see resolveInlineElementSlots) rather than leaving them at their old
 * absolute position — which is what plain remove()+insert() does, and why a
 * Move on a commented inline array can misplace a comment onto an unrelated
 * line (see "Extending to elements inside multi-line arrays" in
 * docs/PLAN-Comment-Ownership.md).
 *
 * It isn't enough to protect only `node`'s own comments: writer.remove()'s
 * per-container "orphaned comment" cleanup reasons purely by absolute line
 * number, with no notion of ownership, so relocating `node` past *other*
 * elements can drag an unrelated element's own comment along as a side
 * effect (or leave it stranded) even though that element never moved. Every
 * commented element in the container is protected the same way: its
 * comment(s) are detached before the move and re-attached afterward, based
 * on how far *that specific element* actually shifted — which may differ
 * from how far `node` itself moved, or be zero.
 */
export function moveInlineElement(root: Root, parent: TreeNode, node: TreeNode, toIndex: number): void {
  if (isMultilineInlineContainer(parent) && isDocument(root)) {
    const hostContainer = findHostContainer(root, parent);
    if (hostContainer) {
      const slots = resolveInlineElementSlots(parent, hostContainer.items as TreeNode[]);

      const detached: Array<{ owner: TreeNode; ownerOriginalStart: { line: number; column: number }; comments: Comment[] }> = [];
      let nodeOwnStart: { line: number; column: number } | undefined;
      let nodeOwnEnd: { line: number; column: number } | undefined;

      for (const slot of slots) {
        if (slot.kind !== 'member' || !slot.member) continue;
        const comments = slot.items.filter(item => item !== slot.member) as Comment[];

        if (slot.member === node) {
          nodeOwnStart = clonePosition(node.loc.start);
          nodeOwnEnd = clonePosition(node.loc.end);
          if (comments.length) {
            // Extend node's own loc to the full group span so the bare
            // remove()+insert() below accounts for the combined height —
            // matters for a leading, separate-line comment; a no-op for a
            // same-line trailing one, since that doesn't change the line
            // count (mirrors removeMember's identical trick).
            node.loc.start = clonePosition(slot.items[0].loc.start);
            node.loc.end = clonePosition(last(slot.items)!.loc.end);
          }
        }

        if (!comments.length) continue;
        detached.push({ owner: slot.member, ownerOriginalStart: clonePosition(slot.member.loc.start), comments });
        for (const comment of comments) {
          const idx = (hostContainer.items as TreeNode[]).indexOf(comment);
          if (idx >= 0) (hostContainer.items as TreeNode[]).splice(idx, 1);
        }
      }

      remove(root, parent, node, hostContainer.items as TreeNode[]);
      insert(root, parent, node, toIndex, undefined, hostContainer.items as TreeNode[]);

      // Flush before reading anything back out below. Every other element's
      // own loc (an untouched sibling that nonetheless shifted because this
      // move made room around it) only becomes fully current at this point,
      // and it's what each owner's delta below is computed against. It also
      // means any FURTHER change in this patch touching the same container
      // starts from a fully-resolved, non-stale state.
      applyWrites(root);

      for (const { owner, ownerOriginalStart, comments } of detached) {
        let delta: { lines: number; columns: number };
        if (owner === node) {
          // node.loc is still the (possibly extended) relocated group span;
          // derive the shift from that, then restore node's own bare span.
          delta = {
            lines: node.loc.start.line - ownerOriginalStart.line,
            columns: node.loc.start.column - ownerOriginalStart.column
          };
          node.loc.start = { line: nodeOwnStart!.line + delta.lines, column: nodeOwnStart!.column + delta.columns };
          node.loc.end = { line: nodeOwnEnd!.line + delta.lines, column: nodeOwnEnd!.column + delta.columns };
        } else {
          delta = {
            lines: owner.loc.start.line - ownerOriginalStart.line,
            columns: owner.loc.start.column - ownerOriginalStart.column
          };
        }

        for (const comment of comments) {
          shiftNode(comment, delta);
          const insertAt = (hostContainer.items as TreeNode[]).findIndex(
            item => item.loc.start.line > comment.loc.start.line
          );
          if (insertAt === -1) (hostContainer.items as TreeNode[]).push(comment);
          else (hostContainer.items as TreeNode[]).splice(insertAt, 0, comment);
        }
      }

      return;
    }
  }

  remove(root, parent, node);
  insert(root, parent, node, toIndex);
}
