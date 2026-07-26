# Plan: Comment Ownership Model

## Overview

The library has **no model of comment ownership**. A `Comment` is a bare sibling in an `items` array with
no link to the key, row, or table it describes:

```ts
// src/cst.ts:347
export interface Comment extends TreeNode {
  type: NodeType.Comment;
  raw: string;
}
```

Association is re-derived ad hoc wherever it happens to be needed — `next.loc.start.line === node.loc.end.line`
in `writer.remove()` (`src/writer.ts:530`), `getAttachedInlineComment()` in `src/comment-alignment.ts:46`,
one-off comment skips in `src/patch.ts:817` and `src/writer.ts:198`. Each is a different partial answer to
the same question, and none of them handle a comment *above* a key at all.

That is fine while every operation is local (edit a value in place, append a key at the end). It stops
being fine the moment entries **move**, which is what [issue #174](https://github.com/DecimalTurn/toml-patch/issues/174)
(`updateOrder`) requires. Today's evidence of the gap, from `src/__tests__/swap-table-keys.test.ts:36-70`:
after swapping two keys, the `# inline B` trailing comment is **deleted outright** and the own-line comments
stay behind labelling the wrong keys.

This document specifies a single, explicit ownership model and a module that implements it. It is a
**prerequisite** for `updateOrder` (see `docs/PLAN-Update-Order.md`) but is designed to stand on its own:
it introduces no user-visible behaviour change and is independently testable.

---

## Background: how the parser places comments

Four placements, all of which the model has to account for. None of them are obvious from the CST shape.

**1. Own-line comment → its own `Block` in the enclosing container.**
`walkBlock` (`src/parse-toml.ts:1079-1081`) returns `[comment(cursor)]`, pushed straight into
`Document.items` or `Table.items`.

```toml
# a note              <- Comment, Document.items[0]
x = 1                 <- KeyValue, Document.items[1]
```

**2. Trailing comment → *also* its own node, positioned after the key-value.**
There is no structural difference from case 1 — same node type, same array, just a different index. The
only signal is `comment.loc.start.line === keyValue.loc.end.line`.

```toml
x = 1 # a note        <- KeyValue at items[0], Comment at items[1]
```

So these two produce **identical** `Document.items` shapes — `[KeyValue, Comment]` vs `[Comment, KeyValue]`
— and are told apart purely by line arithmetic. This is why the model is phrased in terms of `loc` rather
than array position.

**3. Comment after a section header → the table's *first item*.**
`src/parse-toml.ts:501-513` explicitly permits a comment after `[a]`, and the item loop at 517-524 then
consumes it as `Table.items[0]`:

```toml
[a] # header note      <- Comment becomes Table a.items[0]
x = 1
```

**4. Comments inside a multiline inline table/array → hoisted into the *enclosing* container.**
`inlineTable()` and `inlineArray()` collect interior comments and return them alongside the value
(`src/parse-toml.ts:1307`, 1330-1334, and 1449); `keyValue()` passes them through as `results[1..]`
(`src/parse-toml.ts:1248-1257`). They land immediately after the `KeyValue` in the enclosing `items`, with
**locations pointing inside the braces**:

```toml
x = {
  a = 1, # note        <- Comment lands in Document.items, loc = line 2, col 9
  b = 2
}
```

Consequence: `Document.items = [KeyValue x (lines 1-4), Comment (line 2)]`. The array is **not** sorted by
line here, and any rule phrased as "the comment on the last line of the node" misses it.

### And one placement the parser gets structurally "wrong"

A table consumes every token until the next `[` (`src/parse-toml.ts:517`), so a comment that visually
introduces the *next* section is physically stored in the *previous* one:

```toml
[a]
x = 1

# about b            <- stored in Table a.items, and Table a.loc.end points at it
[b]
y = 2
```

`Table.loc.end` is set from the last item (`src/parse-toml.ts:530-532`), so the donor table's range is
inflated to cover a comment it does not own.

---

## The rules

**Terms.**
- A **member** is an orderable logical child: a root key-value, a `[table]`/`[[array]]` block at document
  level, or a key-value row inside a table body.
- A **comment run** is a maximal sequence of own-line `Comment` nodes on *strictly consecutive* lines. A
  `#`-only line is a `Comment` node like any other and continues the run — see
  [What counts as a blank line](#what-counts-as-a-blank-line-r3).
- A **slot** is a member plus every comment it owns, or an unowned (pinned) comment run.

Rules are evaluated in precedence order.

| | Rule |
|---|---|
| **R1** | **Right-side ownership wins.** A `Comment` with `start.line <= M.loc.end.line`, where `M` is the nearest preceding member, is owned by `M`. |
| **R2** | **Adjacency ownership.** A comment run whose last line is exactly `M.loc.start.line - 1` is owned by the member `M` directly below it. |
| **R3** | **A blank line severs ownership.** A run separated from the member below by one or more blank lines is *unowned* — pinned to its position, never travels. |
| **R4** | **Unowned otherwise.** A run with no member below it in the same container is pinned. |
| **R5** | **Cross-container normalisation.** A trailing run inside a `Table`/`TableArray` that R2 assigns to the *following* document block is re-parented to `Document.items`. |
| **R6** | **A dead-entry run is unowned.** A run in which *every* line is a commented-out entry is pinned, overriding R2. |

### What counts as a blank line (R3)

**A "blank line" means a line with no `Comment` node on it — a gap in line numbers between two consecutive
comments.** It is *not* a judgement about how the line looks.

This matters because a `#` on its own is a perfectly good comment. The tokenizer slices from `#` to
end-of-line (`src/tokenizer.ts:137-141`), so a bare `#` produces a `Comment` node with `raw === "#"`. It
occupies its line, keeps the run contiguous, and is part of the same comment block an author was writing:

```toml
# here is some information
#                              <- a Comment node, raw === "#", NOT a blank line
# And some more, with a key example:
# key = "value1"
Key = "value2"
```

All four comments form **one run** (lines 1-4 are consecutive), the run is R2-adjacent to `Key`, and R6
does not fire because the run is mixed. So the whole block — separator line included — is owned by `Key`
and travels with it.

Compare, with a genuinely empty line:

```toml
# here is some information
                               <- no Comment node: a real gap
# And some more, with a key example:
# key = "value1"
Key = "value2"
```

Now there are two runs: `# here is some information` is pinned by R3, and only the second run travels.

> **Implementation note.** The only correct test is on positions:
> `next.loc.start.line === prev.loc.end.line + 1`. Do **not** test `comment.raw` for emptiness, and do not
> consult the source text — `#`, `# `, and `#\t` are all ordinary comments that continue a run.

### Why R1 comes first

`<=` rather than `===` is deliberate — it is what makes cases 3 and 4 above work:

- `[a] # hdr` — the comment is on the header's line, so it belongs to the **table**, not to the first row
  below it. Without R1-before-R2, `# hdr` would be read as the leading comment of `x = 1` and would be torn
  off the header the moment the row moved.
- Hoisted in-brace comments — `start.line (2) <= keyValue.loc.end.line (4)`, so they ride with their
  key-value. Without this they become orphans, and moving the key-value would drop the comment onto a line
  another node already owns. That corrupts output *silently*: `to-toml.ts:206-217` composes each line as
  `before + raw + after` and merges colliding writes rather than throwing.

For a table body, the "nearest preceding member" is initialised to the header, i.e.
`lastMemberEndLine = table.key.loc.end.line`.

### Worked example 1 — one comment per run

```toml
# banner                  R3 -> pinned (blank line below)

# docs for a              R2 -> owned by `a`
a = 1 # note              R1 -> `# note` owned by `a`
# between                 R2 -> owned by `b` (no blank line)
b = 2
# old_c = 3               R6 -> pinned (run is entirely dead entries)
c = 4

# tail block              R4 -> pinned (nothing below)
```

Slots: `[pinned: # banner]`, `[a: # docs for a, a = 1, # note]`, `[b: # between, b = 2]`,
`[pinned: # old_c = 3]`, `[c: c = 4]`, `[pinned: # tail block]`.

### Worked example 2 — multi-line runs

A run is *maximal over consecutive lines*, so a blank line doesn't just sever ownership (R3) — it also
**splits one visual comment block into two independent runs**, which can then get different verdicts.

```toml
# ==========================     run A, line 1
# Server configuration           run A, line 2   -> R3: pinned (blank line below)
# ==========================     run A, line 3

# Which interface to bind.       run B, line 1
# Use 0.0.0.0 for all.           run B, line 2   -> R2: both owned by `host`
host = "127.0.0.1"

# Legacy, kept for reference:    run C, line 1   -> prose, so run C is mixed
# port = 8080                    run C, line 2
# port = 9090                    run C, line 3   -> R6 needs ALL lines dead; owned by `port`
port = 80

# retries = 3                    run D, line 1
# timeout = 30                   run D, line 2   -> R6: every line dead -> pinned
enabled = true
```

Slots:

| Slot | Contents |
|---|---|
| pinned | run A (3 comments) |
| `host` | run B (2 comments) + `host = "127.0.0.1"` |
| `port` | run C (3 comments) + `port = 80` |
| pinned | run D (2 comments) |
| `enabled` | `enabled = true` |

Three things this example is chosen to pin down:

- **Runs are all-or-nothing.** Run B moves with `host` in full; there is no notion of "the last comment
  belongs to the key and the rest are a banner". If an author wants that split, the blank line is how they
  express it — which is exactly what happened between runs A and B.
- **Run C is mixed, so R6 does not fire**, even though two of its three lines are dead entries. The prose
  line anchors the whole run to `port`. Contrast run D, which is uniformly dead and gets pinned.
- **Run A is pinned by R3, not by content.** Its blank line separates it from run B, and *run B* is what
  sits adjacent to `host`. A banner survives a reorder in place, as intended.

### R5 in detail

Given the `[a]` / `# about b` / `[b]` case above, `normalizeSectionComments(document)`:

1. takes the trailing comment run of each `Table`/`TableArray` in `Document.items`;
2. if the run is R2-adjacent to the **next document block**, splices it out of the donor's `items` and into
   `Document.items` immediately before that block;
3. recomputes the donor's `loc.end` as `max(key.loc.end, max over remaining items)`.

It **moves no lines**, so `toTOML` output is byte-identical — it only makes the tree agree with visual
ownership. If a blank line separates the run from `[b]` (R3), it is unowned and stays inside `[a]`,
travelling with that block, which is the correct reading.

R5 mutates the CST, so it is invoked **only by callers that need it** (the reorder pass). The default patch
path's tree shape is untouched.

### R6 in detail — commented-out entries

Position alone gets one case wrong. A commented-out entry sitting directly above a live one is *not*
documentation for it, and should not travel with it:

```toml
# old_port = 80
port = 8080          # `# old_port = 80` must NOT move with `port`
```

R6 disowns such a run. Detection is a shape test on the comment body — does it look like a TOML entry?

```ts
// src/comment-ownership.ts
// Segment charset matches IS_BARE_KEY (/^[\w-]+$/, src/tokenizer.ts:22).
const KEY_SEGMENT = String.raw`(?:[\w-]+|"[^"]*"|'[^']*')`;

/** `# key = …`, `# a.b.c = …`, `# "quoted key" = …` */
const IS_COMMENTED_OUT_KEY_VALUE =
  new RegExp(String.raw`^#\s*${KEY_SEGMENT}(?:\s*\.\s*${KEY_SEGMENT})*\s*=`);

/** `# [table]`, `# [[array]]`, `# [a.b]` */
const IS_COMMENTED_OUT_HEADER =
  new RegExp(String.raw`^#\s*\[\[?\s*${KEY_SEGMENT}(?:\s*\.\s*${KEY_SEGMENT})*\s*\]\]?\s*$`);
```

Anchoring is what makes this safe. The key position must be a *valid TOML key* — bare (`[\w-]+`), quoted,
or dotted — immediately followed by `=`. Prose that merely contains an equals sign does not qualify,
because the text before it isn't a legal key:

| Comment | Key candidate | Match? |
|---|---|---|
| `# old_port = 80` | `old_port` | ✅ dead entry |
| `# a.b.c = 1` | `a.b.c` | ✅ dead entry |
| `# "my key" = 1` | `"my key"` | ✅ dead entry |
| `# [server]` | — | ✅ dead entry |
| `# TODO: set x = 1` | `TODO: set x` — colon and spaces | ❌ prose, owned |
| `# use x = 1 for this` | `use x` — space | ❌ prose, owned |
| `# see https://a.b?x=1` | `see https://a.b?x` — spaces, `/`, `?` | ❌ prose, owned |

**Mixed runs stay owned.** R6 requires *every* line in the run to be a dead entry. This keeps the common
"doc comment plus superseded value" idiom intact and travelling as one unit:

```toml
# Port to bind to        <- prose, so the run is mixed
# port = 8080            <- dead entry
port = 80                <- R2 still applies: all three lines travel together
```

The alternative — splitting a mixed run and pinning only its dead lines — would leave a pinned comment
*between* an owning comment and its member, breaking slot contiguity for no real benefit. All-or-nothing is
both simpler and closer to intent.

**Residual false positive:** prose of the exact shape `word = word`, e.g. `# note = important`. Narrow
enough to accept; the blank-line opt-out (R3) still applies in reverse — removing the blank line is how an
author opts such a comment back in. If this proves annoying in practice, the upgrade path is to validate
the comment body with the real tokenizer rather than a regex, at the cost of a parse attempt per comment.

---

## Non-goals

**Not in scope for this module:**

- Changing what `writer.remove()` does with the same-line comment it currently deletes
  (`src/writer.ts:530-540`). Fixing that with this model is an obvious follow-up, but it changes existing
  behaviour that `swap-table-keys.test.ts` pins, so it is a separate decision.
- Comment ownership *inside* single-line inline tables and arrays. Those containers cannot hold `Comment`
  nodes at all (`InlineTableItem = InlineItem<KeyValue>[]`), and their interior comments are already
  handled by R1 as hoisted comments of the owning key-value.
- Re-flowing or re-aligning comments. `normalizeInlineCommentAlignmentInString`
  (`src/comment-alignment.ts`) already owns that and stays untouched.

---

## API

**New file: `src/comment-ownership.ts`**

```ts
import { Document, Table, TableArray, TreeNode } from './cst';

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
  isEligibleForLeading?: (member: TreeNode) => boolean
): Slot[];

/** R5. Mutates the tree; loc-preserving, so serialized output is unchanged. */
export function normalizeSectionComments(document: Document): void;
```

`key` uses the **first** key segment so that dotted keys (`hello.world`, `hello.moon`) and repeated
`[[aot]]` entries collapse onto one logical child, matching how `toJS` builds the object.

### Why `isEligibleForLeading` exists

`insert()` with no index appends after everything, including a trailing comment run, and `insertOnNewLine`
places the new node on the line right after it (`src/writer.ts:251-267`). So after an Add:

```toml
[t]
a = 1
# end-of-section note
b = 2                 <- newly inserted; R2 would hand it the note
```

A caller that knows `b` was just inserted passes a predicate excluding it, and the run stays pinned. Without
this, merely adding a key would silently change which member owns an existing comment.

---

## Algorithm

A single left-to-right scan of `container.items`, no lookahead beyond the current node.

```
state: lastMemberEndLine  (init: table.key.loc.end.line for a table body; 0 for a Document)
       pendingRun: Comment[]  (a run of consecutive own-line comments)
       slots: Slot[]

for each item:
  if item is Comment:
      if item.loc.start.line <= lastMemberEndLine:
          R1 -> append to the current (last member) slot
      else if pendingRun is non-empty and item.loc.start.line == pendingRunEnd + 1:
          continue the run
      else:
          flush pendingRun as a pinned slot; start a new run with this comment
  else:                                   # a member
      if pendingRun is non-empty:
          if pendingRunEnd + 1 == item.loc.start.line
             and isEligibleForLeading(item)
             and not pendingRun.every(isCommentedOutEntry):        # R6
              R2 -> the run becomes this member's leading comments
          else:
              R3/R4/R6 -> flush pendingRun as a pinned slot
      open a new member slot; lastMemberEndLine = item.loc.end.line

flush any trailing pendingRun as a pinned slot     # R4
```

where:

```
isCommentedOutEntry(c) =
    IS_COMMENTED_OUT_KEY_VALUE.test(c.raw) or IS_COMMENTED_OUT_HEADER.test(c.raw)
```

Two details that are easy to get wrong:

- **`endLine` is a `max`, not the last item's end.** A slot holding a hoisted in-brace comment has its
  member ending *after* the comment.
- **A member's slot stays open** for subsequent R1 comments. Case 4 puts the hoisted comment after the
  key-value, so the scan must be able to append to the slot it just opened.

`normalizeSectionComments` runs as a separate pass *before* `resolveSlots`, so the scan never has to reason
across container boundaries.

---

## Files to Modify

| # | File | Change |
|---|---|---|
| 1 | `src/comment-ownership.ts` | **New.** `Slot`, `resolveSlots()`, `normalizeSectionComments()`, the R6 dead-entry patterns. |
| 2 | `src/writer.ts` | Lift `recalcContainerEnd` out of the `applyWrites` closure (`src/writer.ts:764-786`) into a shared export; `applyWrites` calls the shared one. Needed by R5 to shrink a donor table. |
| 3 | `src/__tests__/comment-ownership.test.ts` | **New.** Rule-by-rule coverage. |
| 4 | `docs/PLAN-Update-Order.md` | Cross-reference this document as a prerequisite. |

No changes to `patch.ts`, `diff.ts`, `to-toml.ts`, or any existing behaviour.

### On the `recalcContainerEnd` refactor

The correct implementation already exists — `max` over `key` plus all items, and it shrinks as well as
grows — but it is a closure inside `applyWrites` (`src/writer.ts:764`). The three visible alternatives are
all unusable: `postInlineItemRemovalAdjustment` (`src/formatter.ts:117`) uses the *last* item rather than
the max, and `recomputeContainerEnds` (`src/comment-alignment.ts:351`) is module-private and **grow-only**,
so it cannot shrink a donor table after R5 detaches its trailing comment. Lifting the existing one is a
~15-line change already covered by `validate-cst.test.ts`.

---

## Steps

**Step 1 — Lift `recalcContainerEnd`.** Export it (from `src/writer.ts`, or alongside `getSpan` in
`src/location.ts`), have `applyWrites` call the shared version, run `pnpm test` — pure refactor, no
behaviour change.

**Step 2 — R6 patterns.** `IS_COMMENTED_OUT_KEY_VALUE` / `IS_COMMENTED_OUT_HEADER` and the
`isCommentedOutEntry` predicate. Pure string functions with no CST dependency — export them so the
match/no-match table can be tested directly, table-driven.

**Step 3 — `Slot` + `resolveSlots()`.** Implement the scan above. Tests first: the table in the next
section is written to be implementable against `resolveSlots` alone, before R5 exists.

**Step 4 — `normalizeSectionComments()`.** Detach + re-parent + `recalcContainerEnd` on the donor. The
critical assertion is that `toTOML(document.items, format)` is **byte-identical** before and after, for
every fixture in `src/__fixtures__`.

**Step 5 — Wire into `updateOrder`.** Out of scope here; see `docs/PLAN-Update-Order.md`.

---

## Tests — `src/__tests__/comment-ownership.test.ts`

Assert **slot composition** (which comment lands in which slot, and each slot's `startLine`/`endLine`),
not output strings. Output-level assertions belong to the reorder suite.

The R6 match table in §R6 is a separate table-driven suite over `isCommentedOutEntry` alone — no CST, no
fixtures. Every row of that table, both the ✅ and the ❌ cases, becomes an assertion.

| Case | Fixture | Expect |
|---|---|---|
| R1 same-line | `a = 1 # note` | `# note` in `a`'s slot |
| R1 header | `[a] # hdr` ⏎ `x = 1` | `# hdr` in the `[a]` slot, **not** in `x`'s |
| R1 hoisted | `x = {` ⏎ `  a = 1, # note` ⏎ `  b = 2` ⏎ `}` | `# note` in `x`'s slot; `x.endLine === 4` |
| R2 single | `# doc` ⏎ `a = 1` | `# doc` in `a`'s slot |
| R2 multi-line run | `# one` ⏎ `# two` ⏎ `a = 1` | both in `a`'s slot |
| R2 at container start | `# doc` ⏎ `a = 1` as the first lines of a `[t]` body | `# doc` in `a`'s slot |
| R3 below | `# doc` ⏎ *(blank)* ⏎ `a = 1` | `# doc` is a pinned slot |
| R3 above | `a = 1` ⏎ *(blank)* ⏎ `# doc` ⏎ `b = 2` | `# doc` in `b`'s slot |
| R3 split run | `# one` ⏎ *(blank)* ⏎ `# two` ⏎ `a = 1` | `# one` pinned; `# two` in `a`'s slot |
| R3 splits a block, different verdicts | worked example 2, runs A and B | run A (3 comments) pinned; run B (2 comments) both in `host`'s slot |
| `#`-only line continues a run | `# info` ⏎ `#` ⏎ `# more:` ⏎ `# key = "v1"` ⏎ `Key = "v2"` | all four comments in `Key`'s slot |
| `#`-only vs real blank | same fixture with the `#` line replaced by an empty line | `# info` pinned; the other two in `Key`'s slot |
| `#` variants | `# a` ⏎ `#` ⏎ `# b`, then `# a` ⏎ `# ` ⏎ `# b`, then `# a` ⏎ `#\t` ⏎ `# b` | one run in all three cases |
| R4 trailing | `a = 1` ⏎ `# tail` at end of a table body | `# tail` pinned |
| R4 trailing run | `a = 1` ⏎ `# one` ⏎ `# two` at end of a body | both pinned, in one slot |
| Two runs, one member | `# one` ⏎ *(blank)* ⏎ `# two` ⏎ *(blank)* ⏎ `# three` ⏎ `a = 1` | two pinned slots; only `# three` in `a`'s slot |
| R6 dead entry | `# old = 1` ⏎ `new = 2` | `# old = 1` pinned, **not** in `new`'s slot |
| R6 dotted / quoted / header | `# a.b = 1`, `# "my key" = 1`, `# [srv]` above a member | each pinned |
| R6 all-dead run | `# retries = 3` ⏎ `# timeout = 30` ⏎ `enabled = true` | both pinned in one slot |
| R6 mixed run | `# Legacy:` ⏎ `# port = 8080` ⏎ `# port = 9090` ⏎ `port = 80` | all four in `port`'s slot — one prose line defeats R6 |
| R6 prose not matched | `# TODO: set x = 1` ⏎ `a = 1` | owned by `a` |
| R6 residual false positive | `# note = important` ⏎ `a = 1` | pinned — locks in the known limitation |
| `isEligibleForLeading` | predicate returns false for the member | run is pinned |
| Dotted keys | `hello.world` / `b` / `hello.moon` in a `[t]` body | three slots, keys `hello`, `b`, `hello` |
| R5 re-parent | `[a]` ⏎ `x = 1` ⏎ *(blank)* ⏎ `# about b` ⏎ `[b]` | comment moves to `Document.items`; `Table a.loc.end` shrinks to `x`'s end; `toTOML` byte-identical |
| R5 declines | same but with a blank line before `[b]` | comment stays in `Table a` |
| R5 no successor | trailing comment in the last table | unchanged |
| R5 idempotent | run it twice | second call is a no-op |

Plus, in `src/__tests__/validate-cst.test.ts`: after `normalizeSectionComments`, `expectConsistent` must
still hold (`findPositionOverlaps` — every child contained in its parent — and `findInvertedLocations`),
and `items` array order must still equal ascending line order for `Document.items`.

> That last invariant is load-bearing beyond this module: `TomlDocument` stores `document.items` as its CST
> (`src/toml-document.ts:89`) and `toJS` derives the whole JS object by walking array order
> (`src/to-js.ts:133-155`), so if array order and line order ever diverge, `toTomlString` and `toJsObject`
> disagree on the same document. Note that hoisted in-brace comments mean this invariant holds for
> *members*, not for every node — state it as "member slots are in ascending line order".

---

## Verification

```
pnpm test comment-ownership
pnpm test validate-cst
pnpm test                    # nothing else may change
pnpm build && pnpm typecheck
```

The strongest signal for Step 3: round-trip every file in `src/__fixtures__` through
`parseTOML` → `normalizeSectionComments` → `toTOML` and assert byte-equality with the input.

---

## Follow-ups enabled by this model

- **`writer.remove()` dropping same-line comments** (`src/writer.ts:530-540`) — with ownership available,
  removal can drop the comment *because it is owned*, rather than because it happens to share a line, and a
  future `moveItem()` can carry it instead. Changes behaviour pinned by `swap-table-keys.test.ts`, so it
  needs its own decision.
- **`updateOrder`** — the reason this exists. See `docs/PLAN-Update-Order.md`.
- **Comment-preserving key rename / table rename** — same slot machinery.
