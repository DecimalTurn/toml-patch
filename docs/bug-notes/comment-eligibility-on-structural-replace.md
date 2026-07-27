# Comment eligibility for structurally-replaced entries

**Status: partially fixed.** The core bug — a structural table→scalar edit losing its leading
comment during an `updateOrder` reorder in the same patch — is fixed by commit `ce612c0` ("fix:
keep structurally-replaced entries eligible for R2 leading comments"). Two related, out-of-scope
gaps found during the investigation remain open and are tracked here.

Found while verifying a GitHub Copilot review comment on PR #260, which flagged the root cause
precisely: [`resolveSlots`](../../src/comment-ownership.ts)'s `isEligibleForLeading` predicate
(used by [`applyContainerMoves`](../../src/update-order.ts)) decides whether a member may adopt an
adjacent leading comment run via **R2** (adjacency ownership, see
[`PLAN-Comment-Ownership.md`](../PLAN-Comment-Ownership.md)). It keyed eligibility off node
identity in a `WeakSet` snapshotted before the patch ran (`prePatchNodes`), so any node created
*during* the patch — whether genuinely new or a structural replacement — was treated as ineligible.

## Fixed: structural `replace()` in the `isTable(existing)` branch

[`patch.ts`](../../src/patch.ts)'s `isEdit` handling has a special case for a block table section
(e.g. `[x.y.z.w]`) being replaced by a scalar. It can't just splice the replacement in place, so it
regenerates a fresh `KeyValue`/`Table` from scratch via `parseJS` and swaps it in with `writer.ts`'s
`replace()` — an in-place splice at the same array position, so it stays adjacent to whatever
preceded it (e.g. a leading comment).

That fresh node is conceptually *the same entry*, not a new one — but since its object identity
postdates the `prePatchNodes` snapshot, it was wrongly excluded from R2 eligibility. Combined with
an `updateOrder: true` reorder in the same patch, the entry would move to its new position while
its leading comment stayed pinned at the old one.

```toml
# comment about w
[x.y.z.w]
a = 1

[other]
b = 2
```

patched with `{ other: { b: 2 }, x: { y: { z: { w: 42 } } } }` and `{ updateOrder: true }` produced:

```toml
# comment about w
[other]
b = 2

[x.y.z]
w = 42
```

— the comment left behind at the top instead of travelling with `[x.y.z]`/`w = 42`. Fixed by
adding each replacement node (`newTable` and `freshKV`, at `patch.ts`'s two `replace()` call sites
in the `isTable(existing)` branch) into the same set the snapshot populates, renamed from
`prePatchNodes` to `commentEligibleNodes` to reflect that it now tracks eligibility, not just
pre-patch existence. Regression tests: `src/__tests__/patch.test.ts`, `table to scalar replacement`
describe block, "should carry the leading comment along when a ... table->scalar edit is combined
with a reorder" (both the multi-segment and single-segment `replace()` sites).

Two other node-replacement sites were checked and ruled out as unaffected:

- The generic `replace()` fallback at `patch.ts`'s `isEdit` handling (~line 694) — every branch
  above it reassigns `existing`/`replacement` to a sub-field (typically `.value`) before falling
  through, so by the time this line runs it never swaps a full top-level slot member. Marking it
  would be a no-op (`isEligibleForLeading` only ever checks slot members), so no fix needed.
- The `isRename` branch's `replace(original, parent, parent.key, replacement.key)` — swaps only the
  `KeyValue`'s `.key` sub-field, not the whole `KeyValue`. The outer node stays untouched and
  remains correctly present in the original snapshot.

## Still open

### `handleStructuralEdit`'s `freshKV` can orphan a leading comment

`handleStructuralEdit` (`patch.ts`) is a separate structural-edit path, reached when `tryFindByPath`
can't locate `existing` at all (rather than finding a `Table`, as above). It removes the old
node(s) via `remove()` and appends a fresh KV at the document's end via
`insert(original, original, freshKV, undefined)` — not in place, unlike the `isTable(existing)`
branch fixed above.

This is the same class of problem as the already-documented gap in
[`PLAN-Update-Order.md`](../PLAN-Update-Order.md#8-open-questions--follow-ups): *"`writer.remove()`
dropping same-line comments — fixable with the ownership model, but it changes behaviour pinned by
`swap-table-keys.test.ts`."* `remove()` doesn't relocate a comment that physically precedes the
node it strips, so a leading comment above the old entry is left as an orphan at its old physical
position; simply marking `freshKV` "eligible" wouldn't fix this, since the entry it should be
adjacent to no longer exists nearby for R2 to attach to. This needs the same treatment as the
`writer.remove()` gap generally, not the narrower fix that shipped here.

No dedicated regression test isolates this exact call site yet — `swap-table-keys.test.ts` pins the
general `remove()`-drops-comments behavior for a different code path (key swaps).

### `replaceEmptiedTableArrays` can produce invalid TOML placement — independent of `updateOrder`

When every entry of an array-of-tables is removed, `replaceEmptiedTableArrays` (`patch.ts`) inserts
an empty-array `KeyValue` (e.g. `tasks = []`) via `insert(doc, doc, emptyKV, undefined)`, which
appends at the very end of `doc.items` — regardless of where other document items are.

If any `[table]` section already exists in the document, the emptied key lands physically *after*
that section header, which makes it a member of that table rather than the root table — invalid
placement, not just a cosmetic reordering issue. This reproduces **even with `updateOrder` off**,
so it's unrelated to the `isEligibleForLeading` bug above; it was only found as a side effect of
probing candidate test cases for this investigation.

```toml
[[tasks]]
name = "a"

[other]
b = 2
```

patched with `{ tasks: [], other: { b: 2 } }` (no `updateOrder`) produces:

```toml

[other]
b = 2
tasks = []
```

— `tasks = []` now reads as a member of `[other]`, and a re-`parse()` would return
`{ other: { b: 2, tasks: [] } }` rather than the intended `{ other: { b: 2 }, tasks: [] }`. The
`isTable(existing)` branch already has repositioning logic for exactly this hazard (see
`patch.ts`'s single-segment case: after `replace()`, it checks whether a table header now precedes
the fresh KV and, if so, moves the KV back before the first table). `replaceEmptiedTableArrays`
has no equivalent check.

Not documented anywhere before this note, and not covered by the existing `emptying
array-of-tables` tests (`src/__tests__/patch.test.ts`), which only exercise a lone AOT with no
competing sibling key. No regression test has been added for it yet either.
