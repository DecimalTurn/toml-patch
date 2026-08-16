# Fuzz-hardening fixes: round-trip corruption seeds (250000–300000)

**Status: fixed.** Continuation of
[`fuzz-sweep-200000-250000-roundtrip-fixes.md`](./fuzz-sweep-200000-250000-roundtrip-fixes.md) — three
seeds surfaced by the 250000..300000 window of the deterministic `patch()` fuzz sweep
(`scripts/fuzz-run.ts`, 3 random mutations per seed). Each was distilled to a minimal failing case,
pinned with a `test.fails` regression in `src/__tests__/patch.test.ts`, then fixed. Branch
`dev-fuzz-fixes2`.

---

## 1. Multiline inline table emptied then re-populated absorbs a trailing sibling

**272851** (fix commit `d94758e`): a nested inline table whose only key holds a multiline string is
emptied, then re-populated with a short key, while the enclosing inline table has a trailing sibling.
Minimal:

```toml
o6z = { ut = { g7k5gct = { kr9 = """
Bz5~
5
""" } }, w.x = 5 }
```

with `obj.o6z.ut.g7k5gct = { k12: "OGB" }`.

The `change-value` diff removes `kr9` (the multiline-string value) and adds `k12`. Removing the only
item of the multiline inline table `g7k5gct` takes the `emptiedFromContainerLine` path in
`writer.remove()`, which **zeroes** the line offset (the item "shares" the container's bracket line)
and marks the container for tightening. The tightening pass only collapses **empty** containers, so an
Add that re-populates the table keeps the stale multiline end, placing `k12` on a phantom second line
and leaving the removed string's content lines dangling. The enclosing `o6z` then writes its trailing
sibling `w.x` *inside* `ut` instead of after it.

Fix: in the Add handler's `isInlineTable(parent)` branch, when inserting the first item back into a
table that was emptied (`parent.items.length === 0`), collapse its stale multiline `loc.end.line` to
`loc.start.line` (when it was marked `hasInlineContainerNeedingTighten`) so the insert positions the
new item on the bracket row.

---

## 2. AOT entry collapsed to a scalar left sibling `[[key]]` entries behind

**299192 / 299772** (fix commit `e0a7492`): replacing the first entry of an array-of-tables with a
scalar. Minimal:

```toml
[[hc8v]]
a = 1
[[hc8v]]
b = 2
```

with `obj.hc8v[0] = -1937`.

The diff emits a single `Edit ["hc8v", 0]`. `coalesceStructuralReplacements` Strategy 2 deliberately
leaves single element-level edits un-coalesced (fuzz seed 3333), routing them to the
`isTableArray(existing)` branch, which regenerates the whole `hc8v = [ -1937, { b = 2 } ]` KV — but
only `replace()`s `existing` (entry 0), leaving entry 1 (`[[hc8v]] b = 2`) behind. The rebuilt KV and
the surviving entry then define `hc8v` twice and the re-parse fails.

Fix: in the `isTableArray(existing)` branch, when the regenerated array no longer holds only plain
objects (`!jsValue.every(isObject)`), drop every other `[[key]]` entry with the same key before the
`replace`.

---

## 3. `truncateZeroTimeInDates` collapsed a `LocalTime` to `0NaN-NaN-NaN`

**299772** (fix commit `e0a7492`): a time-only `LocalTime` round-tripped with
`truncateZeroTimeInDates: true`. Minimal:

```toml
nm5drkk.p9izjo3 = 00:00:00
```

patching an unrelated key under `{ truncateZeroTimeInDates: true, minimumDecimals: 1 }`.

`LocalTime` stores its value on a meaningless year-`0000` base (`0000-01-01T00:00:00Z`), so its
`getUTCHours()`/`getUTCMinutes()`/`getUTCSeconds()`/`getUTCMilliseconds()` are all zero.
`generateDateTime`'s truncation check therefore fired and rewrapped the time as `new
LocalDate("0000-01-01")`, whose renderer emits `0NaN-NaN-NaN` for the year-0 date.

Fix: skip the truncation when `value instanceof LocalTime` (time-only values have no date to collapse
to).
