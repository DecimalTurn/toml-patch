# Fuzz-hardening fixes: round-trip corruption seeds (60000–80000)

**Status: fixed.** A series of round-trip-corruption bugs surfaced by deterministic fuzz sweeps of
`patch()` against randomly-generated TOML (harness `local/fuzz-run.ts`, 3 random mutations per seed,
in 10k-seed windows). Each was distilled to a minimal failing case, pinned with a `test.fails`
regression in `src/__tests__/patch.test.ts` (or `to-js.test.ts` for the one parser-level bug), then
fixed — one `test(...)` + `fix(...)` commit pair per seed on branch `dev-fuzz-fixes2`.

The failures cluster into five root-cause families, listed here in roughly the order they were hit.
Every fix referenced below has a corresponding commit and distilled regression test.

---

## 1. Inline-table sibling scans miss `InlineItem`-wrapped rows

**Seed 61827** (commit `0eaac4a`). `q = { "".x = 1, "".y = 2 }` replaced by `{ k47: 2555 }` left
`"".y` surviving. The `isRemove` prefix-removal scan iterated `parent.items`, but inline-table rows
are `InlineItem` wrappers — `isKeyValue(sibling)` was `false`, so the second `"".y` row was never
recognized as an extension of the removed `""` prefix and re-defined the key on re-parse.

Fix: also read the key from `isInlineItem(sibling) && isKeyValue(sibling.item)` when scanning
siblings.

---

## 2. Emptied / collapsed table materialisation collides with a surviving section

This is the largest family — several seeds are the *classic* "emitting a `[table]` header (or an
inline table) next to a surviving `[table]` with the same key" failure, each with a slightly
different code path that regenerates the key.

- **62163** (`f4c4089`): nested AOT `[["".Lpfz]]` emptied inside `[[""]]`.
  `replaceEmptiedTableArrays` materialised `"".Lpfz = []` at **root** as a dotted key, redefining
  `""` as an implicit table and colliding with `[[""]]`. Fix: for a nested path, find the parent AOT
  entry and insert `Lpfz = []` *inside* it.

- **67221** (`784d591`): `[["".b.c]]` AOT declared inside an explicit `[""]` table, emptied.
  `replaceEmptiedTableArrays` materialised `"".b.c = []` at root — again redefining `""` as an
  implicit table next to `[""]`. Fix: after the AOT-parent-entry branch, find the deepest explicit
  `[table]` ancestor of the AOT key and insert the emptied array inside it with a **relative** key
  (`b.c = []`).

- **78079** (`efd4e6d`): `["".i3asc2k3y]` collapsing to `i3asc2k3y = "X"` while a separate `[""]`
  table survives. The `isTable(existing)` branch generated a fresh `[parentKey]` header, duplicating
  the surviving `[""]`. Fix: detect a surviving `Table`/`TableArray` whose key **exactly** equals
  `parentKey` and merge the fresh KV into it instead of generating a new header.

- **68244** (`bfb3f7e`): with `inlineTableStart: 0`, `[""].b` → scalar rendered the replacement as
  `"" = { b = 5 }` (an inline table) whose key `[""]` is a **prefix** of the surviving `["".a]`
  section. The seed-43199 "implicit sibling" check only filtered `isKeyValue` siblings and missed the
  `Table` section. Fix: extend that filter to `Table`/`TableArray` so the inline table is converted to
  dotted key-values (`"".b = 5`).

The general lesson: **any** regeneration of a key (as a section header, an inline table, or an
emptied array) must first check — across **all** node kinds (KV, Table, TableArray) — whether a
surviving sibling already owns that key or extends it, and if so merge/convert rather than emit a
second definition.

---

## 3. Key-path encoding collisions in the parser (`to-js.ts`)

**Seed 65682** (commit `aa60d62`, test in `to-js.test.ts`). `parse()` rejected
`[""] \n "" = { x = 1 } \n ["."] \n y = 2` with "Cannot extend inline table at .".

`to-js.ts` tracked the set of inline tables / implicit tables / defined keys via
`joinKey(key) = key.join('.')`. Two **distinct** key paths collide under that encoding:
`["", ""]` (an empty-string key nested in an empty-string table) and the single literal segment
`["."]` both join to `"."` — so the nested empty-key inline table was wrongly registered as the
literal `["."]` table.

Fix: introduced `encodeKey(key) = JSON.stringify(key)` for the `tables` / `inline_tables` /
`defined` / `implicit_tables` / `table_arrays` sets and the inline-table duplicate detection;
`joinKey` (`.`-joined) is retained **only** for human-readable error-message text.

---

## 4. Stale line positions against pending offsets in `writer.ts`

Two seeds where one edit leaves a pending (not-yet-flushed) exit offset on a node, and a second
edit in the same batch reads that node's **pre-offset** position.

- **65785** (`a6d3ca7`): `[a.b.c]` + `[d]` + `[f]`, with `a.b = {k:4}` and `delete d`. The coalesced
  structural edit removes `[a.b.c]` (the *first* document item) **after** `Remove ["d"]` left a
  pending exit offset on `[a.b.c]`. The "nothing above" branch of `writer.remove()`'s blank-line
  `extra` computation measured `next.loc.start.line` pre-offset, over-reclaiming lines and dragging
  `[f]` onto `b = {k:4}`'s line. Fix: compensate `next.loc.start.line` with the removed node's own
  pending exit offset (mirroring the already-present `prevPendingExit` compensation in the
  sibling branch).

- **68861** (`566c642`): a multiline array whose last element is a multiline nested array;
  `splice(2, 0, true)` diffs to Move+Add (the inserted `true` duplicates an existing `true`).
  `moveInlineElement`'s internal `insert()` computed `use_new_line = true` because the same-line
  guard required the **previous** item to be multiline; a single-line `previous` in a shared-line
  container missed the guard, so the tail shifted and `realignInterior` collapsed the nested array
  (its first element lost a digit). Fix: drop the multiline-only condition — any same-line
  previous/next pair forces an inline insert.

---

## 5. Fully-removed key leaves prefix-extending siblings behind

**Seed 79938** (commit `c2d5770`). `delete obj.q` when the source held `q = <date>` alongside
`q."X".y = true` and `[q."Z"]` (a collision the parser leniently accepts). `parse()` returns
`q = <date>` — silently dropping the extensions — so the diff emits only `Remove ["q"]`, which
removes `q = <date>` but leaves the dotted key and table; the re-parse then revives `q` as a table.

Fix: in the `Remove` handler, when the path exactly matches a `KeyValue`'s key, also remove any
sibling whose key **extends** that prefix (longer dotted keys, `[table]`/`[[array]]` sections).
This is the Remove-side analogue of the edit-side `removeSiblingsExtendingPrefix` helper (fuzz seeds
32801 / 39363).

---

## Cross-cutting observations

- The "stale position vs pending exit offset" hazard (family 4) appears whenever two structural edits
  land in the same `applyChanges` batch: the first queues a negative line offset on a neighbour, and
  the second reads that neighbour's raw `loc` before `applyWrites` resolves it. Fixes consistently
  compensate the raw `loc` with `getExitOffsets(root).get(node)` rather than calling `applyWrites`
  early (which would be observable/disruptive to downstream offset bookkeeping in some paths).
- The "surviving section collision" hazards (family 2) all share the same failure signature — the
  emitted output **re-parses as syntactically valid TOML** but defines the same key twice, so the
  harness sees a `roundtrip-mismatch` (re-parse throws "Table already defined" / "Cannot extend
  inline table" / "Implicit table already defined").
