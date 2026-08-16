# Fuzz sweep 650000–750000 — round-trip fixes

## Range

Seeds `650000` through `750000` (inclusive), 100001 seeds, `mutationCount` = 3.

## Failures fixed in this sweep

### Seed 742554 — appending an AOT entry misplaces a non-contiguous sub-table

**Symptom:** `patch()` round-trip returned:

```
.y.0.!: extra in got
.y.1.!: missing in expected
```

A key `!` of the top-level `y` array-of-tables entry 0 was reassigned to entry 1
after `add-array-item at y.1` appended a second entry.

**Root cause:** `y` entry 0 has a nested sub-table `[y."!".)O|&E.<=0]` that is
**non-contiguous** with its `[[y]]` header — an unrelated `[[c|C7...]]` section
sits between them (valid TOML, since the sub-table still belongs to entry 0 as
long as it precedes the next `[[y]]` header). The AOT-append insertion path (the
seed 21525 fix) advanced `index` past the previous entry's sub-tables using a
`while` loop that **broke at the first non-matching section**. Because `[[c]]`
interrupted the run, the loop stopped early and inserted the new `[[y]]` entry
*before* `[[y."!"..]]`, so the sub-table now followed the new header and TOML
re-associated it with entry 1.

**Fix:** In `src/patch.ts`, replace the contiguous `while` loop with a full-document
scan that finds the **last** sub-table of the previous entry (key strictly longer
than, and prefixed by, the AOT key) and places the new entry after it. This
handles sub-tables interleaved with unrelated sections.

**Files changed:**
- `src/patch.ts` — AOT-append `index` advancement now scans the whole document.
- `src/__tests__/patch.fuzz.test.ts` — added `regression for fuzz seed 742554`.

## Debugging notes

This is a non-contiguous variant of the seed 21525 bug ("appending an AOT entry
skips the previous entry sub-tables"). The earlier fix assumed sub-tables were
contiguous with their AOT header; seed 742554 showed they can be separated by
unrelated top-level sections, which the old loop did not tolerate. Minimal repro:

```toml
[[y]]
a = 1

[[c]]
b = 2

[[y."!"]]
ll = 3
```

with `obj.y.push({ k33: 4597 })`.
