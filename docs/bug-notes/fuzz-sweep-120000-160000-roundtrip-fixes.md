# Fuzz-hardening fixes: round-trip corruption seeds (120000–160000)

**Status: fixed.** Continuation of
[`fuzz-sweep-80000-100000-roundtrip-fixes.md`](./fuzz-sweep-80000-100000-roundtrip-fixes.md) — four more
round-trip-corruption bugs surfaced by the 120000..160000 window of the deterministic `patch()` fuzz
sweep (`local/fuzz-run.ts`, 3 random mutations per seed). Each was distilled to a minimal failing
case, pinned with a `test.fails` regression in `src/__tests__/patch.test.ts`, then fixed — test
commits `2185192`, `8db3a7f`, `303afbb`, `e01937f`; fix commits `82c0d35`, `916cd8a`, `cd1f987`,
`4eb1a98`; branch `dev-fuzz-fixes2`.

The first three fall into families already seen in earlier sweeps (inline arrays re-rendered as AOT,
nested AOT entry regeneration, prefix-extending section deletions); the fourth exposes a gap in the
AOT→plain-array coalescing where nested entry edits weren't counted.

---

## 1. Inline-array element re-rendered as an AOT entry

**121096** (commit `82c0d35`): an inline array element turning from a scalar into an object:
```toml
wn9c0 = [ 192915 ]
```
with `obj.wn9c0[0] = { k21: "zxZ" }`.

`parseJS`, at the default `inlineTableStart`, renders an array-of-objects as `[[key]]` sections, so
`findByPath(updated, ["wn9c0", 0])` resolves the replacement to an AOT **entry**, while the document
holds the array INLINE (`wn9c0 = [...]`). Splicing that section in place of the `InlineItem` emitted
`[[wn9c0]]` inside the inline array — defining the key twice and corrupting the re-parse.

Fix (in the Edit handler): when `isInlineItem(existing) && (isTable(replacement) || isTableArray(replacement))`
and the element's parent array is an `InlineArray`, regenerate the element as an `InlineItem`
(`parseJS({ tmp: jsValue }, { inlineTableStart: 0 })` + `generateInlineItem`) — the inverse of the
existing guard in the Add handler.

---

## 2. Nested AOT entry → scalar duplicated the key segment

**129645** (commit `916cd8a`): a deeply-nested array-of-tables entry collapsing to a scalar:
```toml
[[""]]
x = 1
a = 2

[[""."=M._!wD>]".l8401w1]]
k.Bh = 1
wix2 = 2
```
with `obj[""][0]["=M._!wD>]"]["l8401w1"][0] = 4567`.

The `isTableArray(existing)` branch regenerates the collapsed AOT as a fresh KV, but computed its JS
value by walking `change.path.slice(0, existingAotKey.length)`. When the AOT is itself nested inside
another AOT entry, `change.path` interleaves numeric entry indices with string key segments, so that
fixed-length slice misaligned: `["", 0, "=M._!wD>]"]` picked up the `{}` object instead of the `[4567]`
array, re-embedding the `l8401w1` segment and emitting the key twice
(`[""."=M._!wD>]".l8401w1]` + `l8401w1 = [4567]`).

Fix: navigate the full path minus the entry's own trailing numeric index (`typeof last === 'number'`
→ `slice(0, -1)`), rather than the fixed `existingAotKey.length` slice.

---

## 3. Deleting a table left its prefix-extending sections behind

**136292** (commit `cd1f987`): deleting a table whose key a sibling AOT extends:
```toml
[x]
a = 1

[[x.y]]
b = 2
```
with `delete obj.x`.

The Remove handler's prefix-extending-sibling sweeps (seeds 2926, 79938) were all gated on
`removePrefixKv` — only `KeyValue`/`InlineItem`-wrapped-KV nodes. Removing a `[table]`/`[[array]]`
section header skipped the sweep, so `[[x.y]]` survived and the re-parse revived `x` from it.

Fix: add an analogous sweep for `isTable(node) || isTableArray(node)` — remove any Document-level
sibling whose key extends the removed section's key.

---

## 4. AOT → mixed array lost the scalar tail entry

**136865** (commit `4eb1a98`): an array-of-tables replaced by a mixed array (object + scalar):
```toml
[[ng.tll]]
a = 1
b = 2
```
with `obj.ng.tll = [{ k8: 187, k78: [3357.17] }, -4619]`.

A mixed array can't be an AOT (entries must be tables), so `ng.tll` must collapse to an INLINE array
`ng.tll = [{…}, -4619]`. `coalesceStructuralReplacements` Strategy 2 already collapses such
replacements, but its `elementChanges.length < 2` guard only counted DIRECT children
(`path.length === prefix.length + 1`). A mixed-array diff splits the replacement as
`Add[1]` (the scalar tail) plus per-key edits nested under entry 0 (`Add[0, k8]`, `Remove[0, a]`, …)
at depth `prefix.length + 2` — so only the single `Add[1]` was counted and the coalescing was
skipped, leaving the scalar to be re-materialised as an empty `[[[ng.tll]]]` row.

Fix: count **descendant** changes (`path.length > prefix.length` and path starts with `prefix`), not
just direct children — this still preserves the seed-3333 guard (a single array-level `Edit` has no
descendant changes and keeps skipping).
