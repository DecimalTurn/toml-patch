# Fuzz-hardening fixes: round-trip corruption seeds (160000–200000)

**Status: fixed.** Continuation of
[`fuzz-sweep-120000-160000-roundtrip-fixes.md`](./fuzz-sweep-120000-160000-roundtrip-fixes.md) — two
round-trip-corruption bugs surfaced by the 160000..200000 window of the deterministic `patch()` fuzz
sweep (`scripts/fuzz-run.ts`, 3 random mutations per seed). Each was distilled to a minimal failing
case, pinned with a `test.fails` regression in `src/__tests__/patch.test.ts`, then fixed. Branch
`dev-fuzz-fixes2`.

Both fall into the long-standing family of **position/offset bookkeeping** — one in the diff
algorithm's array-walk source-index accounting, one in the rename handler's inline-container
width propagation.

---

## 1. Interspersed add shifts the source index of a later array removal

**179377** (fix commit `0fa79a5`): a multiline inline array that is edited *and* trimmed in the same
patch:

```toml
o4s = [false, '''
aaa''', 30325, false, '''
bbb
ccc''', false, "x", 'y']
```
with `obj.o4s[1] = false` and `obj.o4s.splice(3, 1)`.

`compareArrays` walks `after` left-to-right, emitting changes while splicing its simulation in
lockstep. When it meets an after-value that already exists later in `before`, it normally emits a
**Move**; but for multiline arrays that still have a prior in-place removal (`removedBefore > 0`) it
emits an **Add** (a fresh copy) instead, "refusing" the move to avoid dragging multiline content
(fuzz seed 62263). That Add splices a *new* element into the simulation **before** the original
it declined to move, shifting every later simulation slot — including the very original it will
remove a moment later — one index to the right.

The removal's source index is `index + removedBefore`, where `removedBefore` models only the
**left**-shift of prior removals. The refused-move Add introduces a **right**-shift of one slot, so
the later surplus-duplicate removal lands one position too far right and removes the array's
neighbour (`Remove [4]` 🡒 `"bbb\nccc"`) instead of the surplus scalar (`Remove [3]` 🡒 `false`).

Fix: cancel one unit of the removal shift when the refused-move Add fires (`removedBefore--`). The
branch is already gated on `removedBefore > 0`, so the counter cannot go negative. This is narrowly
scoped — the genuinely-new-element `Add as new item` fallback is untouched, leaving the source-index
math intact for every other case (the earlier, broader "track adds and subtract them" attempt fixed
this seed but regressed ~38 unrelated seeds, and was reverted in commit `56f9041`).

---

## 2. Dotted-key rename growth inside an inline table left the container end stale

**186384** (fix commit `45c0659`): renaming the last segment of a dotted key *inside an inline table*
to a longer name, while adding a sibling key:

```toml
K = { iw.h6dhsnnqm.ho = false }
```
with `obj.K.iw.h6dhsnnqm = { k75: false, k85: 66.66 }`.

The rename grows `ho` 🡒 `k75` (one column wider), so the KeyValue's value must shift right. The
rename handler already does that — `parent.equals += keyWidthDelta` and
`shiftNode(parent.value, …)` (fuzz seed 46522) — but it only moves the value node itself. The
enclosing `InlineItem`'s `loc.end` (and `InlineTable`'s end / closing brace) is not moved, so the
subsequent `Add` of `k85` measures the previous sibling's stale pre-shift `loc.end.column` and lands
one column left, eating the value's last character: `k75 = fals`.

Fix: after the value shift, also register an exit offset
(`addExitOffset(original, parent.value, { lines: 0, columns: keyWidthDelta })`) so `applyWrites`
propagates the width change past the value to the enclosing inline container's end (and anything
after it), giving later same-patch inserts the settled coordinate.
