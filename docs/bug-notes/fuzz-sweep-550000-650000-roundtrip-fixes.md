# Fuzz sweep 550000–650000 — round-trip fixes

## Range

Seeds `550000` through `650000` (inclusive), 100001 seeds, `mutationCount` = 3.

## Failures fixed in this sweep

### Seed 599513 — moving a multiline inline table produces invalid TOML (leading comma)

**Symptom:** `patch()` emitted broken TOML that failed to re-parse:

```
Error parsing TOML (139, 1): Leading comma in inline table
,-34559.089919nxweV7FF3=...
```

**Root cause:** `moveInlineElement` in `src/comment-ownership.ts` relocates
inline-array/table elements. When a multiline inline table/array is moved toward
the front of a shared-line container, `insert()` applies a rigid horizontal
(column) translation to every subtree node. Interior rows of a multiline inline
container are indented from **line start** (not from the opening bracket), so
they must not move sideways. The existing safeguard `collectAnchored()` restored
those rows — but it was incorrectly gated on `item.loc.start.line > firstLine &&
prev...follows`, i.e. it required the row to *follow* a predecessor on the same
line. The **first** row inside a multiline container has no predecessor, so
`follows` was `false` and its `key`/`value`/`equals` columns were left shifted to
negative values. `toTOML` then rendered the value before the key
(`,-1.5nx=, 94479.23159bv=`), producing invalid inline-table text.

**Fix:** In `collectAnchored()`, drop the `follows` requirement — restore the
position of **all** descendants that start below the moved node's first line,
not just those anchored to a preceding value's end column. The `prev`/`follows`
locals became dead and were removed.

**Files changed:**
- `src/comment-ownership.ts` — simplified the `collectAnchored` guard to `below`.
- `src/__tests__/patch.fuzz.test.ts` — added `regression for fuzz seed 599513`.

## Debugging notes

The trigger is a **Move** of a multiline inline table/array toward the front of
a shared-line container (surfaced here as `obj.a[0] = true`, where the diff
realigns an existing `true`, or equivalently `obj.a.splice(0, 1)`). The minimal
repro is a single-line array containing a multiline inline table; the corruption
shows up as negative column offsets on the interior rows of the moved container.
