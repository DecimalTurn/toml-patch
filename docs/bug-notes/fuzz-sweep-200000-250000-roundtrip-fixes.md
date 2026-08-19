# Fuzz-hardening fixes: round-trip corruption seeds (200000–250000)

**Status: fixed.** Continuation of
[`fuzz-sweep-160000-200000-roundtrip-fixes.md`](./fuzz-sweep-160000-200000-roundtrip-fixes.md) — three
seeds surfaced by the 200000..250000 window of the deterministic `patch()` fuzz sweep
(`scripts/fuzz-run.ts`, 3 random mutations per seed). Each was distilled to a minimal failing case,
pinned with a `test.fails` regression in `src/__tests__/patch.test.ts`, then fixed. Branch
`dev-fuzz-fixes2`.

All three continue a single root-cause family that has dominated this window: **position / index
bookkeeping across the diff algorithm and the CST when arrays, inline tables, and AOT entry indices
interact**.

---

## 1. Fallback add shifted the source index of a later array removal

**208822** (fix commit `ee892da`): a multiline inline array whose nested array is edited *and*
trimmed in the same patch. Minimal:

```toml
zrrm9 = ["a", ["fn", 1, false, true, "K", 2, "PLAIN", """
q9
FB""", 3], 4]
```
with `obj.zrrm9[1][2] = true` and `obj.zrrm9[1].splice(6, 1)`.

`compareArrays` walks `after` left-to-right. When it meets an after-value that isn't found later in
`before` (a genuinely new element), it emits the **"Add as new item"** fallback, splicing a new
element into the simulation. That splice shifts every later simulation slot right by one, but
`removedBefore` (which converts a sim index back to a source index) only models the **left**-shift
of prior removals. A later surplus-duplicate removal therefore computed `index + removedBefore` one
too far right and removed the wrong element (the multiline string instead of the plain scalar).

Fix: in the "Add as new item" fallback, cancel one unit of the removal shift (`removedBefore--`),
guarded by `removedBefore > 0`. This mirrors the already-fixed refused-move Add (seed 179377) and
does *not* touch the genuinely-new-element case where there was no prior removal
(`removedBefore === 0`), which is what kept the earlier breadth of fixes from regressing.

---

## 2. Emptied dotted key inside an inline table under an AOT got the wrong prefix

**224081** (fix commit `43905a5`): deleting the last segment of a dotted key inside an inline table
that sits under an array-of-tables entry. Minimal:

```toml
[[""]]
a = 1

["".o96]
GD64qOzFQn = { x.fj = "abc" }
```
with `delete obj[""][0].o96.GD64qOzFQn.x.fj`.

After removing `fj`, the emptied parent `x` must be re-emitted as `x = {}` inside the inline table.
The Remove handler derives the key **relative to the inline table** (`relativePrefix`) by slicing
`parentPath` (= `change.path` minus the last segment) at `nodeAbsolutePath.length -
kv.key.value.length`. But `change.path` lives in **JS-object coordinates** — where `[""]` is an
array-of-tables, so the path interleaves a numeric entry index `["", 0, "o96", …]` — while
`nodeAbsolutePath` lives in **CST coordinates** — where `o96` is a sibling `[""."o96"]` table, so its
absolute path is `["", "o96", …]` with no index. The length-based slice therefore over-included the
`GD64qOzFQn` segment and re-emitted `GD64qOzFQn.x = {}`, re-parsing to a self-nested table.

Fix: in the `isInlineTable` branch, derive `relativePrefix` by walking `parentPath` and skipping
numeric indices while matching the container's string segments (the same alignment the
`isTable`/`isTableArray` branch already does for fuzz seed 10533).

---

## 3. `patch() threw: Node not found` — resolved transitively

**238803**: `remove-array-item`/`add-array-item` on a nested array. The original failure was
`patch() threw: Node not found at …uk67-.8`. This was the same source-index corruption fixed by #1
(the diff emitted a remove index that pointed at a non-existent array slot), so it passes after the
`compareArrays` fixes (179377 / 208822) and needs no dedicated change.
