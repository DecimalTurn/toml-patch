# Fuzz-hardening fixes: round-trip corruption seeds (80000–100000)

**Status: fixed.** Continuation of
[`fuzz-sweep-60000-80000-roundtrip-fixes.md`](./fuzz-sweep-60000-80000-roundtrip-fixes.md) — four more
round-trip-corruption bugs surfaced by the 80000..100000 window of the deterministic `patch()` fuzz
sweep (`local/fuzz-run.ts`, 3 random mutations per seed). Each was distilled to a minimal failing
case, pinned with a `test.fails` regression in `src/__tests__/patch.test.ts`, then fixed — test
commit `a4a99e9`, fix commit `87bf422`, branch `dev-fuzz-fixes2`.

All four fall into two root-cause families already seen in the earlier sweeps, but through code
paths the earlier fixes hadn't yet covered.

---

## 1. "Key collapses while a sibling extends its prefix" reaches inline tables

The 32801/39363/79938 family (see the 60000–80000 note) removes sibling dotted-keys/sections that
extend a key whose value collapsed. Two seeds showed the sweep was still gated on the wrong
value-shape condition — and one showed a whole branch was missing the sweep entirely.

- **80004** (commit `87bf422`): a key collapses to an **inline table** while a sibling dotted key
  still extends it:
  ```toml
  [a.b]
  "" = 11:17:13.346128
  "".x.y = "v"
  ```
  with `obj.a.b[""] = { k60: 1 }`. The `removeSiblingsExtendingPrefix` call in the
  `isKeyValue(existing) && isKeyValue(replacement)` and `isKeyValue(existing) && isInlineItem(existing)` branches
  was guarded by `isNotTable = !isInlineTable(newValue)` — so an inline-table value skipped the sweep
  and `"".x.y` survived, failing the re-parse with "Cannot extend inline table". Fix: drop the guard
  entirely. In both branches `replacement` is always a KeyValue, so its value can never be a block
  `Table`/`TableArray`; **every** value shape (leaf, array, inline table) must drop prefix-extending
  siblings.

- **82825** (commit `87bf422`): the collapsing key is itself a *dotted* key matched by prefix inside
  an **inline table**:
  ```toml
  x = { "".1.w46j = -916648, "".e-0cxz9.";" = "v" }
  ```
  with `obj.x[""] = "moq45"`. The `findByPath` prefix match lands on `"".1.w46j` (key length 3), so
  `existing` is an `InlineItem` whose key is truncated `"".1.w46j` → `""` in the
  `isInlineItem(existing) && isKeyValue(existing.item) && isKeyValue(replacement)` branch — but that
  branch had the key-truncation logic **without** the sibling sweep (only the
  `isInlineItem && isInlineItem` branch carried it, fuzz seed 11799). Fix: add the
  truncated-prefix sibling sweep (InlineItem row keys included, mirroring 3607/11799) to the
  truncation block.

---

## 2. Stale position vs. pending offset when re-inserting at the front of an inline array

**86547** (commit `87bf422`): a single-line inline array whose two leading elements are both removed
then re-added corrupts the enclosing dotted key:
```toml
b.c.d = [01:48:53, { iuqh = 7544.95655 }, "s", false]
```
with `obj.b.c.d[0] = false` and `obj.b.c.d[1].iuqh = 2010-12-09…`,
format `{ trailingComma: true, bracketSpacing: true, inlineTableStart: 2 }`.

The diff produces `Remove[1], Remove[0], Add[0], Add[1]`. Removing a leading element with no
previous sibling registers a pending **enter** offset on the `InlineArray` itself
(`writer.remove()` targets `parent`, since an InlineArray has no `.key`). `insert()` then positions
the index-0 child against `parent.loc.start` — a stale, pre-offset column — so the re-inserted
elements land on top of the `b.c.d = [` text and `applyWrites` clobbers it.

Fix: in the Add handler's `isInlineArray` branch, `applyWrites` before an index-0 insert when the
array still carries a pending enter offset — the non-emptied counterpart of the existing seed-92
guard (which only flushed when `parent.items.length === 0`) and an extension of the seed-11557 guard
(which only covered Document/Table/TableArray).

---

## 3. AOT → plain array mis-coalescing when the elements are dates

**86724** (commit `87bf422`): an array-of-tables collapses to a plain array of dates:
```toml
[[x_i42]]
m = 1
wxq = 2
```
with `obj.x_i42 = [2008-09-12…, 2031-08-14…]`.

The diff emits `Edit["x_i42",0] + Add["x_i42",1]`. `coalesceStructuralReplacements` Strategy 2
("AOT replaced by an array that no longer holds only plain objects") checks
`staysAllObjects = value.every(el => el !== null && typeof el === 'object' && !Array.isArray(el))`.
A `Date` satisfies `typeof === 'object'`, so the two-date array was wrongly judged "all objects" and
**not** coalesced; the `isTableArray(existing)` branch then regenerated the whole `[date1, date2]`
array from `jsValue`, and the surviving `Add[1]` double-added `date2`.

Fix has two parts:
- `staysAllObjects` now uses `isObject(el)` (which already excludes `Date`/Temporal/arrays), so
  date-element arrays are correctly coalesced.
- Guard Strategy 2 to only coalesce when there are **≥2** element-level changes under the prefix.
  A single `Edit` (e.g. `[[a.b.c]]` → `[date]`) must keep flowing through the
  `isTableArray(existing)` branch, which re-renders the parent as a proper `[section]` header;
  collapsing it to a structural edit would route through `handleStructuralEdit` and flatten it to an
  inline table (fuzz seed 3333).

---

## Cross-cutting observation

The "stale position vs pending offset" hazard (family 2 above, and 65785/68861 in the prior sweep)
keeps appearing in a new shape each sweep: any *two* structural changes in one `applyChanges` batch
where the second reads a node's raw `loc` that the first shifted. The fix pattern is now firmly
established — **flush `applyWrites` (or compensate with the pending offset) before re-inserting
against a position a prior removal in the same batch invalidated** — and the gap here was simply that
the existing flush guards (seed 92 empty-array, seed 11557 Document/Table/TableArray) didn't yet cover
the *non-empty single-line inline array* case.
