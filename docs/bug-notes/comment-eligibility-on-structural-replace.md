# Comment eligibility for structurally-replaced entries

**Status: fixed.** Two rounds:

1. `ce612c0` — the core bug: a structural table→scalar edit losing its leading comment during an
   `updateOrder` reorder in the same patch.
2. The two follow-ups that round 1 left open (see "Root-key placement" below) — both turned out to
   share a single root cause and were fixed together, along with the comment-orphaning symptom.

A pre-existing issue found while probing these, unrelated to both, is recorded under "Still open".

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

## Root-key placement: `handleStructuralEdit` and `replaceEmptiedTableArrays`

Round 1 left these as two separate open items — one framed as comment orphaning, the other as
misplacement. Probing them turned up a single shared cause, and **both corrupt data**, not just
formatting.

A key-value that physically follows a `[table]` header parses as a member of *that section*, not
of the root table. Both paths appended their regenerated root key at the very end of the document
via `insert(…, undefined)`, so whenever any section existed the key was silently reparented:

| Input | Patched with | Reparsed as | Should be |
|---|---|---|---|
| `[[tasks]]` + `[other]` | `{tasks: [], other: {b: 2}}` | `{other: {b: 2, tasks: []}}` | `{tasks: [], other: {b: 2}}` |
| `[[i]]` + `[other]` | `{i: 42, other: {b: 2}}` | `{other: {b: 2, i: 42}}` | `{i: 42, other: {b: 2}}` |

The `isTable(existing)` branch already guarded against exactly this, with repositioning logic
inlined after its `replace()`. The fix extracts that into `hoistRootKeyValueAboveTables()` /
`rootKeyValueInsertIndex()` and applies it to all three sites:

- **`replaceEmptiedTableArrays`** — inserts at `rootKeyValueInsertIndex(doc)` (just above the first
  section header) instead of appending.
- **`handleStructuralEdit`** — restructured to mirror the proven `isTable` pattern: `replace()` the
  first old node in place, `remove()` any remaining ones, then hoist. Swapping in place rather than
  remove-then-append matters twice over — it keeps the key's blank-line budget (appending produced
  a doubled blank line, and a bare append-then-move tripped a `to-toml.ts` crash on stale `loc`
  bookkeeping), and it keeps the key adjacent to its leading comment.

That last point resolves the comment-orphaning symptom too: hoisting the key back above the section
header lands it directly under the comment that stayed behind, so no separate `writer.remove()`
work was needed after all. The related `writer.remove()`-drops-comments gap noted in
[`PLAN-Update-Order.md`](../PLAN-Update-Order.md#8-open-questions--follow-ups) is genuinely a
different code path (key swaps, pinned by `swap-table-keys.test.ts`) and remains open there.

`handleStructuralEdit` also now receives `commentEligibleNodes` and registers its `freshKV`, for
the same reason the `isTable` sites do — it is a replacement, not a new entry.

Regression tests, all previously failing: `src/__tests__/patch.test.ts`, three in `emptying
array-of-tables` and two in `structural type replacements`. The pre-existing tests missed this
because they only ever exercised documents with no competing section (`should replace single AOT
entry with scalar` asserts nothing beyond `not.toThrow()`).

## Still open

### Emptying an array-of-tables resurrects a key the caller deleted

Unrelated to the above and **pre-existing** — verified by running the same input against the
pre-fix commit, which behaves identically apart from the placement bug already described.

Removing an array-of-tables key *entirely* from the JS object still emits `key = []` in the output.
Given `[[tasks]] / name = "a"` patched with `{ other: { b: 2 } }` — no `tasks` key at all — the
result still contains `tasks = []`, so a re-`parse()` returns a key the caller asked to delete. The
`isRemove` branch records the key in `emptiedAotKeys` when it removes the last entry, without
distinguishing "emptied to `[]`" from "deleted outright", and `replaceEmptiedTableArrays` then
re-materialises it.

Adjacent to the two skipped tests in `meaningful error messages`
(`src/__tests__/patch.test.ts`), which cover other AOT-removal edge cases. No test pins this one.

### Blank-line residue when deleting the document's first section

Also pre-existing and independent of everything above: deleting the first item of a document leaves
its line slot behind. `[first] / a = 1` + `[other] / b = 2` patched with `{ other: { b: 2 } }`
yields a leading blank line (`"\n[other]\nb = 2\n"`), identical before and after this fix. In the
emptied-AOT case that residue compounds with the newly-hoisted key to give two blank lines rather
than the usual one — placement is correct and the output parses correctly, only the spacing is off.

This is the already-known gap pinned by the skipped test `should not accumulate blank lines when
deleting tables one at a time` (`blank line accumulation on table deletion`). Fixing it means
touching `writer.ts`'s removal bookkeeping, which is why it stayed out of scope here.
