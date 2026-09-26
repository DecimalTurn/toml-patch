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
  isInlineItem,
  isString,
  hasItems,
  InlineItem
} from './cst';
import { last } from './utils';
import { clonePosition } from './location';
import { remove, insert, shiftNode, applyWrites, recalcContainerEnd, perLine, getExitOffsets, addExitOffset, Root } from './writer';

// See docs/Comment-Ownership.md for the full model (rules R1-R6).

// R6 — commented-out entries are not owned.
// Segment charset matches IS_BARE_KEY (/^[\w-]+$/, src/tokenizer.ts:22).
const KEY_SEGMENT = String.raw`(?:[\w-]+|"[^"]*"|'[^']*')`;

/** `# key = ...`, `# a.b.c = ...`, `# "quoted key" = ...` */
export const IS_COMMENTED_OUT_KEY_VALUE =
  new RegExp(String.raw`^#\s*${KEY_SEGMENT}(?:\s*\.\s*${KEY_SEGMENT})*\s*=`);

/** A value after `=` in a commented-out KV: a quoted string, number, boolean,
 *  date-like token, or a single bare word.  Multi-word prose (e.g.
 *  `# key = 1 is something to consider`) does NOT match, so the comment
 *  is treated as alive prose rather than a dead entry. */
const VALUE_TOKEN = String.raw`(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|"""[\s\S]*?"""|'''[\s\S]*?'''|[^\s#]+)`;

/** Full-line match: `# key = value` where value is a single token. */
const IS_PURE_COMMENTED_OUT_KV =
  new RegExp(String.raw`^#\s*${KEY_SEGMENT}(?:\s*\.\s*${KEY_SEGMENT})*\s*=\s*${VALUE_TOKEN}\s*$`);

/** `# [table]`, `# [[array]]`, `# [a.b]` */
export const IS_COMMENTED_OUT_HEADER =
  new RegExp(String.raw`^#\s*\[\[?\s*${KEY_SEGMENT}(?:\s*\.\s*${KEY_SEGMENT})*\s*\]\]?\s*$`);

export function isCommentedOutEntry(comment: Comment): boolean {
  return IS_PURE_COMMENTED_OUT_KV.test(comment.raw) || IS_COMMENTED_OUT_HEADER.test(comment.raw);
}

/**
 * True when a `#` appears outside of quotes after the `=` in a
 * commented-out-KV line — i.e. the line has an inline trailing comment
 * (`# key = val # note`).  `#` inside a quoted value (e.g.
 * `# key = "a # b" extra`) is NOT an inline comment.
 */
function hasInlineCommentAfterValue(comment: Comment): boolean {
  const eqIdx = comment.raw.indexOf('=');
  if (eqIdx < 0) return false;
  let inDQuote = false;
  let inSQuote = false;
  for (let i = eqIdx + 1; i < comment.raw.length; i++) {
    const ch = comment.raw[i];
    if (ch === '\\') { i++; continue; }
    if (!inSQuote && ch === '"') { inDQuote = !inDQuote; continue; }
    if (!inDQuote && ch === "'") { inSQuote = !inSQuote; continue; }
    if (!inDQuote && !inSQuote && ch === '#') return true;
  }
  return false;
}

/**
 * True when the comment looks enough like a KV to act as a barrier in
 * scanGroups.  Broader than `isCommentedOutEntry`: also matches lines with
 * an inline trailing comment (`# key = val # note`) and lines whose value
 * part is short enough not to be obvious prose (≤3 words after `=`).
 */
function looksLikeKV(comment: Comment): boolean {
  if (isCommentedOutEntry(comment)) return true;
  if (!IS_COMMENTED_OUT_KEY_VALUE.test(comment.raw)) return false;
  // Has an inline comment after the value: `# key = val # note`
  if (hasInlineCommentAfterValue(comment)) return true;
  // Short value: `# key = a few words` (not running prose)
  const afterEq = comment.raw.replace(/^[^=]*=\s*/, '');
  const wordCount = afterEq.split(/\s+/).filter(Boolean).length;
  return wordCount <= 3;
}

/** Extract the first key segment from a commented-out KV like `# key = val`. */
function commentedOutFirstKey(comment: Comment): string | undefined {
  const m = comment.raw.match(IS_COMMENTED_OUT_KEY_VALUE);
  if (!m) return undefined;
  // Strip `#` prefix and everything from `=` onward, then trim.
  // For dotted keys like `# a.b.c = val`, this gives `a.b.c`.
  let key = m[0].replace(/^#\s*/, '').replace(/\s*=.*$/, '').trim();
  // Take only the first segment for comparison with the KV's own first key.
  const dot = key.indexOf('.');
  if (dot >= 0) key = key.substring(0, dot);
  // Strip quotes if present
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key || undefined;
}

/**
 * True only for a genuinely multi-line InlineTable/InlineArray. Single-line
 * containers can never hold hoisted interior comments in the first place
 * (Non-goals in the plan doc), and — critically — `start.line === end.line`
 * for a single-line container means ANY same-line trailing comment on the
 * OUTER key-value (e.g. `data = [x, y] # note`) would otherwise appear to
 * fall "inside" a nested single-line array's own line range too, wrongly
 * treating an unrelated comment as hoisted from inside it. The element-level
 * ownership machinery below (resolveInlineElementGroups / removeMember's and
 * moveInlineElement's InlineTable/InlineArray branches) must only engage
 * here, matching writer.ts's own `isMultilineInlineContainer` convention.
 */
function isMultilineInlineContainer(node: TreeNode): node is InlineTable | InlineArray {
  return (isInlineTable(node) || isInlineArray(node)) && node.loc.end.line > node.loc.start.line;
}

export interface Group {
  kind: 'member' | 'pinned';
  /** The orderable child: KeyValue | Table | TableArray. Absent for pinned blocks. */
  member?: TreeNode;
  /** First key segment — `key.value[0]` / `key.item.value[0]`. Absent for pinned blocks. */
  key?: string;
  /** Every node in the group, in items-array order. */
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
 * The rule scan shared by resolveGroups (Document/Table/TableArray, where members
 * and comments are already interleaved in one items array) and
 * resolveInlineElementGroups (InlineTable/InlineArray, where they are merged from
 * two different arrays first — see that function). `items` must already be in
 * ascending line order; a `Comment` node is a comment, anything else is a member.
 */
function scanGroups(
  items: TreeNode[],
  initialLastMemberEndLine: number,
  isEligibleForLeading: (member: TreeNode) => boolean,
  memberKey = getMemberKey
): Group[] {
  const groups: Group[] = [];

  let lastMemberEndLine = initialLastMemberEndLine;
  let currentMemberGroup: Group | undefined;
  let pendingRun: Comment[] = [];

  const flushPendingAsPinned = () => {
    if (!pendingRun.length) return;
    groups.push({
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
        // R1: trailing ownership.
        if (currentMemberGroup) {
          currentMemberGroup.items.push(item);
          currentMemberGroup.endLine = Math.max(currentMemberGroup.endLine, item.loc.end.line);
        } else {
          // Owned by the container's own header (e.g. `[a] # hdr`), which
          // isn't itself a member of `items` — nothing to attach to, and it
          // never travels with any row.
          groups.push({ kind: 'pinned', items: [item], startLine: item.loc.start.line, endLine: item.loc.end.line });
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
      if (adjacent && isEligibleForLeading(item)) {
        // R2, subject to R6.  A commented-out KV whose key differs from
        // the following KV's key acts as a barrier: only comments after
        // the LAST such barrier belong to the KV.  Dead entries whose
        // key matches the KV's key stay in the block (they are "related").
        // This applies to all-dead blocks too — when every dead entry's
        // key matches the KV, R6 does not apply and the block is owned.
        const key = memberKey(item);
        if (key !== undefined) {
          let lastBarrierIdx = -1;
          for (let i = pendingRun.length - 1; i >= 0; i--) {
            // Use looksLikeKV for barrier detection — a line like
            // `# key = val # extra` still severs ownership even though
            // it isn't a "pure" dead entry.
            const ck = looksLikeKV(pendingRun[i]) ? commentedOutFirstKey(pendingRun[i]) : undefined;
            if (ck !== undefined && ck !== key) {
              lastBarrierIdx = i;
              break;
            }
          }
          if (lastBarrierIdx >= 0) {
            const pinned = pendingRun.splice(0, lastBarrierIdx + 1);
            groups.push({
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
        // R3 (severed by a blank line) or R6 (dead-entry block) — pin it.
        flushPendingAsPinned();
      }
    }

    const groupItems: TreeNode[] = [...leading, item];
    const group: Group = {
      kind: 'member',
      member: item,
      key: memberKey(item),
      items: groupItems,
      startLine: groupItems[0].loc.start.line,
      endLine: item.loc.end.line
    };
    groups.push(group);
    currentMemberGroup = group;
    lastMemberEndLine = item.loc.end.line;
  }

  flushPendingAsPinned(); // R4: a trailing block with no member below it.

  return groups;
}

/**
 * Partitions a container's items into ownership groups, in document order.
 * Pure: does not mutate the tree.
 *
 * @param isEligibleForLeading - optional predicate; members that fail it cannot
 *   acquire leading comments via R2. Used by callers that have just inserted
 *   nodes which must not adopt a preceding block.
 */
export function resolveGroups(
  container: Document | Table | TableArray,
  isEligibleForLeading: (member: TreeNode) => boolean = () => true,
  memberKey: (member: TreeNode) => string | undefined = getMemberKey
): Group[] {
  // For a table body, comments on the header's own line (`[a] # hdr`) are
  // owned by the header itself (R1) — initialising to the header's end line
  // makes that fall out of the same check as ownership by a preceding row.
  const initialLastMemberEndLine = isDocument(container) ? 0 : container.key.loc.end.line;
  return scanGroups(container.items as TreeNode[], initialLastMemberEndLine, isEligibleForLeading, memberKey);
}

/**
 * The element-level analogue of resolveGroups, for a multi-line InlineTable or
 * InlineArray. Unlike Document/Table/TableArray, an inline container's own
 * `.items` can never hold a Comment (InlineTableItem/InlineArrayItem are both
 * InlineItem<...>) — the parser hoists interior comments out into the
 * *enclosing* Document/Table's `.items` instead (Background, case 4 in the
 * plan doc). `hostItems` is that enclosing container's `.items`; this merges
 * the comments physically inside `container`'s line range back in with
 * `container.items` (sorted into true reading order) before running the same
 * scan resolveGroups uses.
 *
 * There is no R6 analogue for bare array elements (they aren't `key = value`
 * shaped), but nothing here suppresses R6 for an InlineArray's own comments —
 * see docs/Comment-Ownership.md for why that's an accepted, untested edge
 * case rather than a deliberate rule.
 */
export function resolveInlineElementGroups(
  container: InlineTable | InlineArray,
  hostItems: TreeNode[]
): Group[] {
  const interiorComments = hostItems.filter(
    (item): item is Comment =>
      isComment(item) &&
      (item.loc.start.line > container.loc.start.line ||
        (item.loc.start.line === container.loc.start.line && item.loc.start.column >= container.loc.start.column)) &&
      (item.loc.end.line < container.loc.end.line ||
        (item.loc.end.line === container.loc.end.line && item.loc.end.column <= container.loc.end.column))
  );

  const merged: TreeNode[] = [...(container.items as TreeNode[]), ...interiorComments].sort(
    (a, b) => a.loc.start.line - b.loc.start.line || a.loc.start.column - b.loc.start.column
  );

  return scanGroups(merged, container.loc.start.line, () => true);
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
/**
 * Finds the InlineItem that wraps `target` (an InlineTable/InlineArray)
 * inside its own parent container's items, searching the whole tree.
 */
function findWrapperItem(root: TreeNode, target: TreeNode): InlineItem | undefined {
  function walk(node: TreeNode): InlineItem | undefined {
    if (isKeyValue(node)) return walk(node.value);
    if (!hasItems(node)) return undefined;
    for (const item of node.items as TreeNode[]) {
      if (isInlineItem(item) && item.item === target) return item;
    }
    for (const item of node.items as TreeNode[]) {
      const found = walk(isInlineItem(item) ? item.item : item);
      if (found) return found;
    }
    return undefined;
  }
  return walk(root);
}

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
 * (src/parse-toml.ts:517-524). This re-parents such blocks into Document.items,
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
 * R5, computed lazily: if `container`'s trailing comment block is R2-adjacent
 * to `nextBlock` (and not R6-dead), returns it — these are the comments a
 * removal of `nextBlock` must take along, even though they physically live
 * in `container.items`. Returns undefined otherwise.
 */
function trailingOwnedRun(container: Table | TableArray, nextBlock: TreeNode): Comment[] | undefined {
  const lastGroup = last(resolveGroups(container));
  if (!lastGroup || lastGroup.kind !== 'pinned') return undefined;

  const runItems = lastGroup.items as Comment[];
  const adjacent = lastGroup.endLine + 1 === nextBlock.loc.start.line;
  const allDead = runItems.every(isCommentedOutEntry);
  if (!adjacent || allDead) return undefined;

  return runItems;
}

/**
 * Removes `member` from `parent.items` along with every comment it owns
 * (leading block and trailing comments — see resolveGroups), plus,
 * when `member` is a [table]/[[array]] block, any trailing comment block the
 * parser filed under the PRECEDING sibling table but which R5 assigns to
 * `member` instead. Falls back to a plain removal when `parent` isn't a
 * container the ownership model applies to (e.g. InlineTable/InlineArray).
 *
 * Passing `commentOwnership = false` keeps leading (own-line) and
 * cross-container comment blocks in place — only those stop traveling. Same-line
 * trailing comments (R1) always travel with their member; that rule predates the
 * option and is not optional.
 */
export function removeMember(root: Root, parent: TreeNode, member: TreeNode, commentOwnership = true): void {
  // Leading (R2) and cross-container (R5) ownership is the optional part this
  // flag gates. Trailing (R1) ownership always applies.
  const removeLeading = commentOwnership === true;

  if (isDocument(parent) && (isTable(member) || isTableArray(member))) {
    if (removeLeading) {
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
  }

  if (isDocument(parent) || isTable(parent) || isTableArray(parent)) {
    const group = resolveGroups(parent).find(s => s.member === member);
    if (group) {
      const memberIndex = group.items.indexOf(member);

      // Leading (R2) comments: removed only in full-ownership mode.
      if (removeLeading) {
        for (let i = 0; i < memberIndex; i++) {
          const item = group.items[i];
          if (!(parent.items as TreeNode[]).includes(item)) continue;
          remove(root, parent, item);
        }
      }

      // The member itself (absorbs a same-line trailing comment via the writer
      // primitive), then any remaining trailing (R1) comments spliced directly.
      if ((parent.items as TreeNode[]).includes(member)) {
        remove(root, parent, member);
      }
      for (let i = memberIndex + 1; i < group.items.length; i++) {
        const item = group.items[i];
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
      const group = resolveInlineElementGroups(parent, hostContainer.items as TreeNode[]).find(s => s.member === member);
      if (group) {
        const memberIndex = group.items.indexOf(member);
        const leading = group.items.slice(0, memberIndex) as Comment[];
        const trailing = group.items.slice(memberIndex + 1) as Comment[];

        // Leading (R2) hoisted comments are removed only in full-ownership mode.
        // Trailing (R1) comments always go with the member.
        const toRemove: Comment[] = [...trailing];
        if (removeLeading) toRemove.unshift(...leading);

        // Splice the removed comments out of hostContainer (a DIFFERENT array
        // from `parent.items`) — purely structural, zero line offset. Extend the
        // member's own loc to cover the removed comments' lines plus its own, so
        // a single remove() call propagates one combined height reduction.
        for (const comment of toRemove) {
          const idx = (hostContainer.items as TreeNode[]).indexOf(comment);
          if (idx < 0) continue;
          (hostContainer.items as TreeNode[]).splice(idx, 1);
        }

        if (toRemove.length) {
          const spanStart = removeLeading && leading.length
            ? leading[0].loc.start
            : member.loc.start;
          const spanEnd = trailing.length
            ? last(trailing)!.loc.end
            : member.loc.end;
          member.loc.start = spanStart;
          member.loc.end = spanEnd;
        }

        remove(root, parent, member, hostContainer.items as TreeNode[]);

        // Flush immediately so a subsequent removeMember/moveInlineElement call
        // on the same container starts from resolved, non-stale positions.
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
 * (see resolveInlineElementGroups) rather than leaving them at their old
 * absolute position — which is what plain remove()+insert() does, and why a
 * Move on a commented inline array can misplace a comment onto an unrelated
 * line (see "Elements inside multi-line arrays and inline tables" in
 * docs/Comment-Ownership.md).
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
 *
 * Same-line trailing (R1) comments always travel. Leading (own-line) comments
 * travel only when `commentOwnership` is `true`; with `false` they are left in
 * place (the writer's orphaned-comment pre-compensation keeps them at their
 * original line).
 */
export function moveInlineElement(root: Root, parent: TreeNode, node: TreeNode, toIndex: number, commentOwnership = true): void {
  // Leading (own-line) comments travel only in full-ownership mode; trailing
  // (R1) comments always travel.
  const carryLeading = commentOwnership === true;

  let sharedLineContainerBeforeMove = false;
  if (isMultilineInlineContainer(parent) && isDocument(root)) {
    const hostContainer = findHostContainer(root, parent);
    if (hostContainer) {
      const groups = resolveInlineElementGroups(parent, hostContainer.items as TreeNode[]);

      // The container's per-line vs shared-line layout must be judged on
      // the state BEFORE this move: remove()+insert() inflate the tail's
      // line coordinates, and a later perLine() read of the corrupted span
      // misclassifies a shared-line container as per-line, skipping the
      // tail realignment and stranding the rows (fuzz seed 16034).
      //
      // The honest signature of a shared-line layout is a RUN of at least
      // three adjacent items STARTING on the same line.  Two items sharing
      // a line is the signature of a per-line container whose multiline
      // member ends on the next item's line — the writer offsets handle
      // those (fuzz seeds 9553, 9829).  A same-line pair caused by a
      // just-inserted item still carrying its pending exit offset is
      // transient and must not count (fuzz seed 761).
      {
        const items = (parent as InlineTable | InlineArray).items as TreeNode[];
        let run = 1;
        for (let i = 1; i < items.length; i++) {
          if (items[i].loc.start.line === items[i - 1].loc.start.line) {
            const prevPending = getExitOffsets(root).get(items[i - 1]);
            const selfPending = getExitOffsets(root).get(items[i]);
            if (prevPending || selfPending) continue;
            run++;
            if (run >= 3) {
              sharedLineContainerBeforeMove = true;
              break;
            }
          } else {
            run = 1;
          }
        }
      }

      const detached: Array<{ owner: TreeNode; ownerOriginalStart: { line: number; column: number }; comments: Comment[] }> = [];
      let nodeOwnStart: { line: number; column: number } | undefined;
      let nodeOwnEnd: { line: number; column: number } | undefined;
      let nodeInnerEnd: { line: number; column: number } | undefined;

      // Snapshot descendants of the moved node that start BELOW its first
      // line.  insert()'s rigid horizontal translation shifts every subtree
      // column by the first line's column delta, but interior rows of a
      // multiline inline table/array are indented from line start (not from
      // the opening bracket), so they must not move sideways.  This covers
      // both rows anchored to a preceding multiline value's end column
      // (fuzz seed 706: `, 5, 6` after a multiline string inside a moved
      // nested array slid left onto the string's closing quotes) and the
      // FIRST row of a multiline container that has no predecessor at all
      // (fuzz seed 599513: `nxweV7FF3` slid to a negative column and toTOML
      // emitted `,-1.5nx=`).
      const anchoredDescendants: Array<{ node: TreeNode; start: { line: number; column: number }; end: { line: number; column: number }; endOnly?: boolean; equals?: number }> = [];
      const collectAnchored = (container: TreeNode, firstLine: number) => {
        if (!hasItems(container)) return;
        const items = container.items as TreeNode[];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const below = item.loc.start.line > firstLine;
          if (below) {
            anchoredDescendants.push({ node: item, start: clonePosition(item.loc.start), end: clonePosition(item.loc.end) });
          }
          // A multiline element's wrapper END (where its comma lands) is
          // anchored to the element's own end column, which the leaf path of
          // the rigid translation leaves alone — but the wrapper's end is
          // shifted with the first line.  Restore it too.
          if (item.loc.end.line > firstLine && item.loc.end.line > item.loc.start.line) {
            anchoredDescendants.push({ node: item, start: clonePosition(item.loc.start), end: clonePosition(item.loc.end), endOnly: true });
          }
          if (isInlineItem(item)) {
            const inner = item.item;
            if (below) {
              const kv = isKeyValue(inner) ? inner : undefined;
              anchoredDescendants.push({
                node: inner,
                start: clonePosition(inner.loc.start),
                end: clonePosition(inner.loc.end),
                equals: kv ? kv.equals : undefined
              });
              // The KV's key and value nodes ride the same rigid translation
              // as the row, but only the row and the KV are restored above —
              // the key keeps its shifted column and toTOML writes it at its
              // own loc, overwriting the preceding content (fuzz seed 19506).
              if (kv) {
                anchoredDescendants.push({
                  node: kv.key,
                  start: clonePosition(kv.key.loc.start),
                  end: clonePosition(kv.key.loc.end)
                });
                anchoredDescendants.push({
                  node: kv.value,
                  start: clonePosition(kv.value.loc.start),
                  end: clonePosition(kv.value.loc.end)
                });
              }
            }
            // A multiline STRING's own end column is what its closing quotes
            // follow — offsets can nudge it while the wrapper's end (with the
            // comma) stays put, making toTOML's multiline writer consume the
            // columns between them (fuzz seed 706).  Restore it independently.
            if (inner.loc.end.line > firstLine && inner.loc.end.line > inner.loc.start.line) {
              anchoredDescendants.push({ node: inner, start: clonePosition(inner.loc.start), end: clonePosition(inner.loc.end), endOnly: true });
            }
            collectAnchored(inner, firstLine);
          } else if (hasItems(item)) {
            collectAnchored(item, firstLine);
          }
        }
      };

      for (const group of groups) {
        if (group.kind !== 'member' || !group.member) continue;
        const memberIndex = group.items.indexOf(group.member);
        const leadingComments = group.items.slice(0, memberIndex) as Comment[];
        const trailingComments = group.items.slice(memberIndex + 1) as Comment[];

        // Trailing (R1) comments always travel. Leading (R2) comments travel
        // only in full-ownership mode; otherwise they stay in place, kept at
        // their line by the writer's orphaned-comment pre-compensation, so
        // they are deliberately NOT detached here.
        const comments = carryLeading
          ? [...leadingComments, ...trailingComments]
          : trailingComments;

        if (group.member === node) {
          nodeOwnStart = clonePosition(node.loc.start);
          nodeOwnEnd = clonePosition(node.loc.end);
          if (isInlineItem(node)) {
            nodeInnerEnd = clonePosition(node.item.loc.end);
          }
          collectAnchored(isInlineItem(node) ? node.item : node, nodeOwnStart.line);
          if (comments.length) {
            // Extend node's own loc to the full group span so the bare
            // remove()+insert() below accounts for the combined height —
            // matters for a leading, separate-line comment; a no-op for a
            // same-line trailing one, since that doesn't change the line
            // count (mirrors removeMember's identical trick).
            node.loc.start = clonePosition(group.items[0].loc.start);
            node.loc.end = clonePosition(last(group.items)!.loc.end);
          }
        }

        if (!comments.length) continue;
        detached.push({ owner: group.member, ownerOriginalStart: clonePosition(group.member.loc.start), comments });
        for (const comment of comments) {
          const idx = (hostContainer.items as TreeNode[]).indexOf(comment);
          if (idx >= 0) (hostContainer.items as TreeNode[]).splice(idx, 1);
        }
      }

      // For a multiline item removed from the END of a shared-line container,
      // remove()'s bracket-slide offset (fuzz seed 706) mixes the removed
      // item's LAST line with the previous item's line.  The re-insert below
      // cannot cancel it — its own span-based offset has the same cross-line
      // defect — so the pair leaks past the container and corrupts every
      // subsequent node on the flush (fuzz seed 900: the rows after the array
      // slid onto the multiline string's content).  Drop both; the tail
      // realignment below repositions the container's interior explicitly.
      const nodeIndexBeforeRemove = (parent.items as TreeNode[]).indexOf(node);
      const removedWasLast = nodeIndexBeforeRemove === (parent.items as TreeNode[]).length - 1;
      const prevBeforeRemove = nodeIndexBeforeRemove > 0
        ? (parent.items as TreeNode[])[nodeIndexBeforeRemove - 1]
        : undefined;

      // A multiline node moved to the FRONT (index 0) that, before the move,
      // shared its START line with the item now following it (`prevBeforeRemove`,
      // which ends up at index 1).  The writer's per-line offset model assumes
      // each item sits on its own line, so the shared-line item's columns go
      // stale (it lands with a negative start column, overwriting the moved
      // multiline string's closing delimiter).  The tail realignment below is
      // gated on `sharedLineContainerBeforeMove`, which a two-item same-line
      // pairing does NOT satisfy — so record this case explicitly (fuzz seed
      // 421965: `[false, """\nAAA\n""", "z"]` moving the string to the front
      // left `false` at column -2 on the string's last line).
      const movedMultilineToFront = toIndex === 0 && nodeIndexBeforeRemove > 0 &&
        node.loc.end.line > node.loc.start.line &&
        prevBeforeRemove !== undefined &&
        prevBeforeRemove.loc.start.line === node.loc.start.line;

      remove(root, parent, node, hostContainer.items as TreeNode[]);

      let cancelMultilineLastRemovalOffsets = false;
      if (removedWasLast && prevBeforeRemove !== undefined &&
          node.loc.end.line > node.loc.start.line &&
          !perLine(parent as InlineArray | InlineTable)) {
        const prevPending = getExitOffsets(root).get(prevBeforeRemove);
        if (prevPending) {
          getExitOffsets(root).delete(prevBeforeRemove);
          cancelMultilineLastRemovalOffsets = true;
        }
      }

      // Resolve the removal's offsets before re-inserting, so insert()
      // measures against final positions.  Otherwise insert() absorbs the
      // removal's pending exit offset into the inserted item's own offset,
      // which then leaks into the container's end column (and any wrapper
      // InlineItem's end) — a comma or closing bracket lands inside the
      // last value on that line (fuzz seed 50).
      applyWrites(root);
      insert(root, parent, node, toIndex, undefined, hostContainer.items as TreeNode[]);

      if (cancelMultilineLastRemovalOffsets) {
        const childPending = getExitOffsets(root).get(node);
        if (childPending) {
          childPending.lines = 0;
          childPending.columns = 0;
        }
      }

      // Flush before reading anything back out below. Every other element's
      // own loc (an untouched sibling that nonetheless shifted because this
      // move made room around it) only becomes fully current at this point,
      // and it's what each owner's delta below is computed against. It also
      // means any FURTHER change in this patch touching the same container
      // starts from a fully-resolved, non-stale state.
      applyWrites(root);

      // insert() translates the node rigidly: every line of a multi-line
      // node receives the first line's column delta.  A multi-line value's
      // content columns below the first line are part of its raw text and
      // must not move — the writer only reads the END column on the last
      // line, so restore just that, on both the wrapper InlineItem and the
      // inner value node it wraps (fuzz seed 50).
      if (nodeOwnStart && nodeOwnEnd && node.loc.end.line > node.loc.start.line) {
        node.loc.end.column = nodeOwnEnd.column;
        // The inner value keeps its OWN original end — for a multiline
        // string the wrapper's end includes the comma that follows, and
        // assigning it to the string makes toTOML's multiline writer
        // consume the columns between the closing quotes and the next item
        // (fuzz seed 706).
        if (isInlineItem(node) && nodeInnerEnd && node.item.loc.end.line > node.item.loc.start.line) {
          node.item.loc.end.column = nodeInnerEnd.column;
        }
      }

      // Restore the columns of anchored below-first-line descendants that the
      // rigid translation shifted horizontally (see the snapshot comment above).
      for (const { node: descendant, start, end, endOnly, equals } of anchoredDescendants) {
        if (endOnly) {
          descendant.loc.end.column = end.column;
          continue;
        }
        descendant.loc.start.column = start.column;
        if (descendant.loc.end.line === descendant.loc.start.line) {
          descendant.loc.end.column = end.column;
        }
        if (equals !== undefined && isKeyValue(descendant)) {
          (descendant as KeyValue).equals = equals;
        }
      }

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

      // The writer's offset model assumes the next sibling sits at the moved
      // node's first-line column.  When the moved node wraps lines (a
      // multiline string) inside a container whose items share lines, that
      // assumption breaks and every item after the moved one lands in the
      // wrong place, dragging the container's (and any wrapper InlineItem's)
      // end column with it.  Realign the tail sequentially: each item starts
      // right after the previous one's end (fuzz seed 50).
      const container = parent as InlineTable | InlineArray;
      // Gate the tail realignment on the original layout classification:
      // perLine() reads the container's own end, which the moves above can
      // leave stale.  The pre-move capture reflects the true layout.  A
      // multiline node moved to the front also needs the tail realignment
      // (see movedMultilineToFront above), even though the shared-line run
      // is only two items and `sharedLineContainerBeforeMove` stays false.
      const sharedLineContainer = sharedLineContainerBeforeMove || movedMultilineToFront;
      if (sharedLineContainer) {
        // Re-anchor the interior rows of a multiline inline container whose
        // subtree the tail shift above translated rigidly: the shiftNode
        // moves every row's START, but rows anchored to a preceding
        // multiline value keep their END columns — the boundary between a
        // multiline string row and the next row then closes up and the
        // separator comma is overwritten (fuzz seed 16552).
        const realignInterior = (inner: InlineTable | InlineArray, wrapper?: TreeNode) => {
          let anchor: { line: number; column: number } | undefined;
          for (const row of inner.items as TreeNode[]) {
            if (!anchor) {
              anchor = { line: row.loc.end.line, column: row.loc.end.column + 2 };
              continue;
            }
            const d = {
              lines: anchor.line - row.loc.start.line,
              columns: anchor.column - row.loc.start.column
            };
            if (d.lines !== 0 || d.columns !== 0) {
              shiftNode(row, d);
              if (row.loc.end.line > row.loc.start.line) {
                row.loc.end.column -= d.columns;
                if (isInlineItem(row) && row.item.loc.end.line > row.item.loc.start.line) {
                  row.item.loc.end.column -= d.columns;
                }
              }
              const rowInner = isInlineItem(row)
                ? (isKeyValue(row.item) ? row.item.value : row.item)
                : row;
              if ((isInlineTable(rowInner) || isInlineArray(rowInner)) &&
                  rowInner.loc.end.line > rowInner.loc.start.line) {
                realignInterior(rowInner, row);
              }
            }
            anchor = { line: row.loc.end.line, column: row.loc.end.column + 2 };
          }
          if (anchor) {
            inner.loc.end = { line: anchor.line, column: anchor.column - 1 };
            // The enclosing InlineItem's end carries the comma that follows
            // the closing brace — track the new end so the comma stays
            // adjacent (fuzz seed 16552).
            if (wrapper && wrapper.loc.end.line === inner.loc.end.line) {
              wrapper.loc.end.column = inner.loc.end.column;
            }
          }
        };

        let tailAnchor: { line: number; column: number } | undefined;
        for (const item of container.items as TreeNode[]) {
          if (item === node) {
            tailAnchor = { line: node.loc.end.line, column: node.loc.end.column + 2 };
            continue;
          }
          if (!tailAnchor) continue;
          const delta = {
            lines: tailAnchor.line - item.loc.start.line,
            columns: tailAnchor.column - item.loc.start.column
          };
          if (delta.lines !== 0 || delta.columns !== 0) {
            shiftNode(item, delta);
            const itemInner = isInlineItem(item)
              ? (isKeyValue(item.item) ? item.item.value : item.item)
              : item;
            if ((isInlineTable(itemInner) || isInlineArray(itemInner)) &&
                itemInner.loc.end.line > itemInner.loc.start.line) {
              realignInterior(itemInner, isInlineItem(item) ? item : undefined);
            }
          }
          // A multiline STRING member's end line may be stale (the move
          // offsets inflated it) — derive it from the raw content so the
          // chain doesn't push the following items onto the wrong lines
          // (fuzz seed 9553).
          let itemEndLine = item.loc.end.line;
          const tailInner = isInlineItem(item) ? item.item : item;
          if (isString(tailInner) && tailInner.loc.end.line > tailInner.loc.start.line) {
            itemEndLine = tailInner.loc.start.line + tailInner.raw.split('\n').length - 1;
            tailInner.loc.end.line = itemEndLine;
            item.loc.end.line = itemEndLine;
          }
          tailAnchor = { line: itemEndLine, column: item.loc.end.column + 2 };
        }
        if (tailAnchor) {
          const endBeforeRealign = clonePosition(container.loc.end);
          container.loc.end = { line: tailAnchor.line, column: tailAnchor.column - 1 };

          // The container may itself be an element of another inline
          // container; the wrapper InlineItem's end must track the
          // container's end or its comma lands inside the last value.
          const wrapper = findWrapperItem(root, container as TreeNode);
          if (wrapper) {
            wrapper.loc.end = { line: container.loc.end.line, column: container.loc.end.column };
          }

          // Nodes AFTER the container (same-line followers, enclosing
          // table rows, the table's own end) were positioned by the writer
          // offsets this realignment has just replaced.  Re-anchor them to
          // the new end with a pending exit offset so a later flush shifts
          // them by exactly the end delta (fuzz seed 900: the row following
          // the moved array would otherwise sit on the moved item's stale
          // column and the subsequent removal then slides it sideways onto
          // the multiline string's content).
          const endDelta = {
            lines: container.loc.end.line - endBeforeRealign.line,
            columns: container.loc.end.column - endBeforeRealign.column
          };
          if (endDelta.lines !== 0 || endDelta.columns !== 0) {
            addExitOffset(root, wrapper ?? (container as TreeNode), endDelta);
          }
        }
      }

      return;
    }
  }

  // Capture the container's bracket gaps before the move so they can be
  // restored afterwards.  remove()+insert() uses writer offsets that do
  // not perfectly cancel over consecutive Moves on the same container,
  // which corrupts the leading gap (space after `[`/`{`) and trailing gap
  // (space before `]`/`}`).
  const container = parent as InlineTable | InlineArray;
  const itemsBefore = container.items as TreeNode[];
  const firstBefore = itemsBefore[0];
  const lastBefore = itemsBefore[itemsBefore.length - 1];
  const originalLeadingGap = firstBefore.loc.start.column - container.loc.start.column - 1;
  const originalTrailingGap = container.loc.end.column - 1 - lastBefore.loc.end.column;

  remove(root, parent, node);
  insert(root, parent, node, toIndex);

  // Flush so consecutive Moves start from resolved positions (prevents
  // exit-offset accumulation on the same target) and so the gap
  // measurements below see final positions.
  applyWrites(root);

  // Restore bracket gaps corrupted by the move's offsets.
  const itemsAfter = container.items as TreeNode[];
  const firstAfter = itemsAfter[0];
  const leadingGap = firstAfter.loc.start.column - container.loc.start.column - 1;
  if (leadingGap !== originalLeadingGap) {
    shiftNode(firstAfter, {
      lines: 0,
      columns: originalLeadingGap - leadingGap
    });
  }
  const lastAfter = itemsAfter[itemsAfter.length - 1];
  const trailingGap = container.loc.end.column - 1 - lastAfter.loc.end.column;
  if (trailingGap !== originalTrailingGap) {
    container.loc.end.column = lastAfter.loc.end.column + 1 + originalTrailingGap;
  }
}
