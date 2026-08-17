# Fuzz sweep 1000000–1100000 — round-trip fixes

## Range

Seeds `1000000` through `1100000` (inclusive), 100001 seeds, `mutationCount` = 3.

## Failures fixed in this sweep

### Seed 1024477 — table → array-of-tables misplaces a nested sub-table

**Symptom:** `patch()` round-trip returned:

```
.tp6.0.k41: extra in got
.tp6.1.k41: missing in expected
```

`k41` (a nested object inside entry 0 of a freshly-converted array-of-tables)
was reassigned to entry 1 on re-parse.

**Root cause:** The seed's `change-type` mutation replaces `tp6` (a plain table)
with an array of objects whose first entry holds a nested object `k41 = { k96 =
… }`. With `inlineTableStart: 2`, that nested object is too deep to stay inline,
so it is extracted into a separate `[tp6.k41]` section. `formatNestedTablesMultiline`
(`src/formatter.ts`) collected every extracted sub-table into a single flat
`additionalTables` list and appended it at the **end** of the document. For an
AOT with multiple entries that pushes a sub-table of entry 0 (`[tp6.k41]`)
*after* entry 1 (`[[tp6]]`), so the re-parse nests `k41` under the second entry.

This is a general ordering bug, not specific to AOTs: even two top-level tables
rendered `[server]\n…\n[other]\n…\n[server.database]\n[other.nested]` instead of
keeping each sub-table after its own parent.

**Fix:** `formatNestedTablesMultiline` now records each extracted sub-table
together with its parent (the `Table`/`TableArray` it was extracted from) and
inserts it **immediately after its parent block**, not at the document end. A
per-parent counter keeps multiple children of the same parent in the correct
order.

**Files changed:**
- `src/formatter.ts` — positional insertion of extracted sub-tables in
  `formatNestedTablesMultiline` / `processTableForNestedInlines`.
- `src/__tests__/patch.fuzz.test.ts` — added `regression for fuzz seed 1024477`.

## Debugging notes

Minimal repro:

```toml
tp6.":" = 451070
```

with `obj.tp6 = [{ k61: 439, k41: { k96: Date } }, { k76: -2790, k10: 1301, k89: 798.6 }]`
and format `{ inlineTableStart: 2, minimumDecimals: 2 }`. The `[tp6.k41]` section
must land between `[[tp6]]` entry 0 and entry 1.

Note: the seed's deterministic `add-array-item` at `I]GdO.1` (a scalar append
into an AOT) is **skipped** by `fuzzOne`'s AOT-entry guard, so it is not part of
the actual failing mutation set — `fuzz-investigate.ts` (which does not
replicate that guard) reports it, but the authoritative `fuzz-run.ts`/`fuzzOne`
does not apply it.
